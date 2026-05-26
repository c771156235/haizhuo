"""
工单管理 API
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models.user import User, UserRole, UserRoleAssociation
from app.models.work_order import WorkOrder, WorkOrderStatus
from app.schemas.work_order import (
    WorkOrderCreate,
    WorkOrderAssign,
    WorkOrderTeamLeaderUpdate,
    WorkOrderCancel,
    WorkOrderTransfer,
    WorkOrderResponse,
    IntraGroupTransferMemberItem,
)
from app.schemas.common import PaginationParams, PaginatedResponse
from app.api.deps import get_current_user, get_current_role, require_role
from app.core.workflow import accept_work_order, WorkflowError
from app.core.permissions import can_manage_work_order, can_view_work_order
from app.utils.work_order_pool import team_leader_may_access_pool_work_order
from app.utils.work_order_query_scope import (
    apply_work_order_role_scope,
    work_order_standard_loader_options,
)
from app.models.task import TaskDetailRequirement
from app.core.audit import log_work_order_action
from app.models.audit_log import AuditAction
from app.models.notification import NotificationType
from app.services.notification_service import (
    notify_work_order_assigned, 
    notify_work_order_accepted, 
    notify_work_order_cancelled, 
    notify_task_dispatched,
    notify_work_order_revoked_by_team_leader_change,
    notify_work_order_team_leader_changed,
    notify_work_order_revoked,
    notify_work_order_transferred_by_member,
    notify_work_order_cancelled_by_peer_dispatch,
    mark_notifications_as_read_by_resource,
)
from app.services.work_order_completion import (
    post_commit_work_order_completed_followup,
    set_work_order_completed_at_if_missing,
)
from app.utils.team_leader_peer_scope import get_peer_team_leader_ids
from fastapi import Request

router = APIRouter(prefix="/work-orders", tags=["工单管理"])


def get_fde_group_name_for_work_order(db: Session, work_order: WorkOrder) -> Optional[str]:
    """组长已定时按组长解析组名；待认领时按 dispatch_group_id 解析。"""
    if work_order.team_leader_id:
        return get_fde_group_name_for_team_leader(db, work_order.team_leader_id)
    if work_order.dispatch_group_id:
        from app.models.group import Group

        g = db.query(Group).filter(Group.id == work_order.dispatch_group_id).first()
        return g.name if g else None
    return None


def get_fde_group_name_for_team_leader(db: Session, team_leader_id: int) -> Optional[str]:
    """根据工单组长用户 ID 解析其作为组长所属的 FDE 组名（与 /groups/me/my-group 组长分支逻辑一致）。"""
    from sqlalchemy import or_
    from app.models.group import Group, group_leaders

    group = (
        db.query(Group)
        .join(group_leaders, Group.id == group_leaders.c.group_id, isouter=True)
        .filter(
            or_(
                Group.leader_id == team_leader_id,
                group_leaders.c.user_id == team_leader_id,
            )
        )
        .distinct()
        .first()
    )
    if group:
        return group.name
    return None


def enrich_work_order_response(work_order: WorkOrder, db: Session) -> WorkOrderResponse:
    """填充工单响应对象的详细需求信息"""
    response = WorkOrderResponse.from_orm_with_relations(work_order)
    
    # 填充详细需求信息
    if work_order.detail_requirement:
        response.detail_requirement_id = work_order.detail_requirement.id
        response.customer_unit = work_order.detail_requirement.customer_unit
        response.industry_type = work_order.detail_requirement.industry_type
        response.customer_source = work_order.detail_requirement.customer_source
        response.requirement_content = work_order.detail_requirement.requirement_content
        response.expected_visit_time = work_order.detail_requirement.expected_visit_time
        response.customer_visit_address = work_order.detail_requirement.customer_visit_address
        response.customer_manager_name = work_order.detail_requirement.customer_manager_name
        response.customer_manager_contact = work_order.detail_requirement.customer_manager_contact
        
        # 填充提交人信息
        if work_order.detail_requirement.sales_contact:
            response.sales_contact_name = work_order.detail_requirement.sales_contact.real_name
            # 获取提交人的销售单位
            from app.models.user import UserRoleAssociation
            sales_role = db.query(UserRoleAssociation).filter(
                UserRoleAssociation.user_id == work_order.detail_requirement.sales_contact_id,
                UserRoleAssociation.role == UserRole.SALES_CONTACT,
                UserRoleAssociation.is_active == True
            ).first()
            if sales_role and sales_role.sales_unit:
                response.sales_contact_unit = sales_role.sales_unit
    else:
        # 如果没有详细需求，从任务级别获取客户单位、行业类型（兼容旧数据）
        if work_order.task:
            if work_order.task.customer_unit:
                response.customer_unit = work_order.task.customer_unit
            if work_order.task.industry_type:
                response.industry_type = work_order.task.industry_type

    # 工单所属 FDE 组名
    response.group_name = get_fde_group_name_for_work_order(db, work_order)

    return response


@router.post("", response_model=WorkOrderResponse, status_code=status.HTTP_201_CREATED)
def create_work_order(
    work_order_data: WorkOrderCreate,
    request: Request,
    user_role: tuple = Depends(require_role(UserRole.MANAGER)),
    db: Session = Depends(get_db)
):
    """创建工单（总管派单给组长后，由系统自动创建）"""
    current_user, current_role = user_role
    work_order = WorkOrder(
        **work_order_data.dict(),
        status=WorkOrderStatus.PENDING_ASSIGN  # 创建时状态为待转派
    )
    db.add(work_order)
    db.commit()
    
    # 加载关联数据
    work_order = db.query(WorkOrder).options(
        joinedload(WorkOrder.task),
        joinedload(WorkOrder.team_leader),
        joinedload(WorkOrder.member),
        joinedload(WorkOrder.detail_requirement).joinedload(TaskDetailRequirement.sales_contact)
    ).filter(WorkOrder.id == work_order.id).first()
    
    # 记录操作日志（工单创建通常由派单操作触发，但这里也记录一下）
    try:
        log_work_order_action(
            db=db,
            user_id=current_user.id,
            action=AuditAction.CREATE,
            work_order_id=work_order.id,
            description=f"创建工单：{work_order.work_order_no}",
            details={
                "task_id": work_order.task_id,
                "task_name": work_order.task.task_name if work_order.task else None,
                "team_leader_id": work_order.team_leader_id
            },
            request=request
        )
        # 提交操作日志
        db.commit()
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to log work order creation action: {str(e)}")
        # 操作日志记录失败不影响主业务，继续执行
    
    return enrich_work_order_response(work_order, db)


@router.get("", response_model=PaginatedResponse[WorkOrderResponse])
def get_work_orders(
    task_id: Optional[int] = Query(None, description="任务ID筛选"),
    status: Optional[WorkOrderStatus] = Query(None, description="状态筛选"),
    search: Optional[str] = Query(None, description="搜索工单编号"),
    team_leader_id: Optional[int] = Query(None, description="组长ID筛选"),
    member_id: Optional[int] = Query(None, description="成员ID筛选"),
    start_date: Optional[str] = Query(None, description="创建时间起始日期（格式：YYYY-MM-DD）"),
    end_date: Optional[str] = Query(None, description="创建时间结束日期（格式：YYYY-MM-DD）"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(10, ge=1, le=100, description="每页数量"),
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """获取工单列表（根据当前激活角色权限过滤，支持分页和搜索）"""
    current_user, current_role = user_role
    
    query = db.query(WorkOrder).options(*work_order_standard_loader_options())
    
    if task_id:
        query = query.filter(WorkOrder.task_id == task_id)
    
    if status:
        # 「待接单」筛选同时覆盖已废弃的 pending，避免旧数据筛不出来
        if status == WorkOrderStatus.PENDING_ACCEPT:
            query = query.filter(
                WorkOrder.status.in_(
                    [
                        WorkOrderStatus.PENDING_ACCEPT.value,
                        WorkOrderStatus.PENDING.value,
                    ]
                )
            )
        else:
            query = query.filter(WorkOrder.status == status)
    
    # 搜索功能
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(WorkOrder.work_order_no.like(search_pattern))
    
    # 组长筛选
    if team_leader_id:
        query = query.filter(WorkOrder.team_leader_id == team_leader_id)
    
    # 成员筛选
    if member_id:
        query = query.filter(WorkOrder.member_id == member_id)
    
    # 日期范围筛选
    if start_date:
        from datetime import datetime
        try:
            start_datetime = datetime.strptime(start_date, '%Y-%m-%d')
            query = query.filter(WorkOrder.created_at >= start_datetime)
        except ValueError:
            pass  # 日期格式错误，忽略该筛选条件
    
    if end_date:
        from datetime import datetime, timedelta
        try:
            # 结束日期需要包含当天的所有时间，所以加一天并减去一秒
            end_datetime = datetime.strptime(end_date, '%Y-%m-%d') + timedelta(days=1) - timedelta(seconds=1)
            query = query.filter(WorkOrder.created_at <= end_datetime)
        except ValueError:
            pass  # 日期格式错误，忽略该筛选条件
    
    query = apply_work_order_role_scope(query, db, current_user, current_role)
    
    # 获取总数
    total = query.count()
    
    # 分页
    pagination = PaginationParams(page=page, page_size=page_size)
    work_orders = query.order_by(WorkOrder.created_at.desc()).offset(pagination.skip).limit(pagination.limit).all()
    
    # 转换为包含关联信息的响应对象
    work_order_responses = [enrich_work_order_response(wo, db) for wo in work_orders]
    
    return PaginatedResponse.create(work_order_responses, total, page, page_size)


@router.get("/{work_order_id}", response_model=WorkOrderResponse)
def get_work_order(
    work_order_id: int,
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """获取工单详情（基于当前激活角色权限）"""
    current_user, current_role = user_role
    
    work_order = db.query(WorkOrder).options(
        joinedload(WorkOrder.task),
        joinedload(WorkOrder.team_leader),
        joinedload(WorkOrder.member),
        joinedload(WorkOrder.dispatch_group),
        joinedload(WorkOrder.detail_requirement).joinedload(TaskDetailRequirement.sales_contact)
    ).filter(WorkOrder.id == work_order_id).first()
    
    if not work_order:
        raise HTTPException(status_code=404, detail="工单不存在")
    
    # 使用当前激活角色的权限和sales_unit
    user_sales_unit = current_role.sales_unit or current_user.sales_unit
    if not can_view_work_order(current_role.role, current_user.id, work_order, user_sales_unit, db=db):
        raise HTTPException(status_code=403, detail="无权查看此工单")
    
    return enrich_work_order_response(work_order, db)


@router.post("/{work_order_id}/claim", response_model=WorkOrderResponse)
def claim_work_order(
    work_order_id: int,
    request: Request,
    user_role: tuple = Depends(require_role(UserRole.TEAM_LEADER)),
    db: Session = Depends(get_db),
):
    """组内待认领工单：任一目标组组长认领后变为待转派。"""
    current_user, current_role = user_role
    work_order = (
        db.query(WorkOrder)
        .options(joinedload(WorkOrder.task))
        .filter(WorkOrder.id == work_order_id)
        .first()
    )
    if not work_order:
        raise HTTPException(status_code=404, detail="工单不存在")

    if work_order.status != WorkOrderStatus.PENDING_GROUP_CLAIM.value:
        raise HTTPException(status_code=400, detail="当前工单不需要认领或已被认领")

    if not team_leader_may_access_pool_work_order(db, current_user.id, work_order):
        raise HTTPException(status_code=403, detail="无权认领此工单")

    work_order.team_leader_id = current_user.id
    work_order.status = WorkOrderStatus.PENDING_ASSIGN.value
    db.commit()
    db.refresh(work_order)

    try:
        log_work_order_action(
            db=db,
            user_id=current_user.id,
            action=AuditAction.UPDATE,
            work_order_id=work_order.id,
            description=f"认领工单：{work_order.work_order_no}",
            details={"task_id": work_order.task_id if work_order.task else None},
            request=request,
        )
        db.commit()
    except Exception as e:
        import logging

        logging.getLogger(__name__).error(f"Failed to log claim action: {str(e)}")

    work_order = (
        db.query(WorkOrder)
        .options(
            joinedload(WorkOrder.task),
            joinedload(WorkOrder.team_leader),
            joinedload(WorkOrder.member),
            joinedload(WorkOrder.dispatch_group),
            joinedload(WorkOrder.detail_requirement).joinedload(TaskDetailRequirement.sales_contact),
        )
        .filter(WorkOrder.id == work_order_id)
        .first()
    )
    return enrich_work_order_response(work_order, db)


@router.post("/{work_order_id}/assign", response_model=WorkOrderResponse)
def assign_work_order(
    work_order_id: int,
    assign_data: WorkOrderAssign,
    request: Request,
    user_role: tuple = Depends(require_role(UserRole.TEAM_LEADER)),
    db: Session = Depends(get_db)
):
    """转派工单给成员（组长）"""
    current_user, current_role = user_role
    work_order = db.query(WorkOrder).options(
        joinedload(WorkOrder.task)
    ).filter(WorkOrder.id == work_order_id).first()
    if not work_order:
        raise HTTPException(status_code=404, detail="工单不存在")
    
    if not can_manage_work_order(current_role.role, current_user.id, work_order, db=db):
        raise HTTPException(status_code=403, detail="无权操作此工单")

    if work_order.status == WorkOrderStatus.PENDING_GROUP_CLAIM.value:
        raise HTTPException(status_code=400, detail="请先认领工单后再转派成员")

    # 验证成员是否存在且角色正确
    # 现在用户可以有多个角色，需要从UserRoleAssociation表中查询
    from app.models.user import UserRoleAssociation
    member = db.query(User).filter(User.id == assign_data.member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    if not member.is_active:
        raise HTTPException(status_code=404, detail="用户已被禁用")
    
    # 检查用户是否有成员角色且已审核通过、活跃
    member_role = db.query(UserRoleAssociation).filter(
        UserRoleAssociation.user_id == assign_data.member_id,
        UserRoleAssociation.role == UserRole.MEMBER,
        UserRoleAssociation.approval_status == "approved",
        UserRoleAssociation.is_active == True
    ).first()
    
    if not member_role:
        raise HTTPException(status_code=404, detail="成员不存在或角色不正确")
    
    # 验证成员是否在组长的组内（要求组长必须有组）
    from sqlalchemy import or_
    from app.models.group import Group, group_leaders
    # 查找当前组长所属的组（兼容 leader_id 与 group_leaders）
    group = db.query(Group).options(
        joinedload(Group.members),
        joinedload(Group.leaders)
    ).join(
        group_leaders, Group.id == group_leaders.c.group_id, isouter=True
    ).filter(
        or_(Group.leader_id == current_user.id, group_leaders.c.user_id == current_user.id)
    ).distinct().first()
    
    if not group:
        raise HTTPException(
            status_code=403,
            detail="您还没有组，无法转派工单。请联系总管创建组并添加成员。"
        )
    
    # 检查成员是否在该组内
    member_ids = [m.id for m in group.members]
    if assign_data.member_id not in member_ids:
        raise HTTPException(
            status_code=403, 
            detail="只能转派工单给组内成员"
        )
    
    work_order.member_id = assign_data.member_id
    # 转派后，状态改为待接单
    work_order.status = WorkOrderStatus.PENDING_ACCEPT.value
    peer_cancelled_work_order_ids: List[int] = []
    if work_order.detail_requirement_id:
        group_leader_ids = set()
        if group.leader_id:
            group_leader_ids.add(group.leader_id)
        for leader in group.leaders or []:
            if leader and leader.id:
                group_leader_ids.add(leader.id)

        if group_leader_ids:
            sibling_work_orders = db.query(WorkOrder).filter(
                WorkOrder.detail_requirement_id == work_order.detail_requirement_id,
                WorkOrder.id != work_order.id,
                WorkOrder.team_leader_id.in_(list(group_leader_ids)),
                WorkOrder.status == WorkOrderStatus.PENDING_ASSIGN.value
            ).all()
            for sibling in sibling_work_orders:
                sibling.status = WorkOrderStatus.CANCELLED.value
                sibling.cancellation_reason = "同组其他组长已转派该需求，当前工单自动失效"
                peer_cancelled_work_order_ids.append(sibling.id)

    db.commit()
    db.refresh(work_order)
    
    # 自动标记相关通知为已读（用户通过待办列表处理事项时，通知应自动标记为已读）
    try:
        mark_notifications_as_read_by_resource(
            db=db,
            user_id=current_user.id,
            resource_type="work_order",
            resource_id=work_order.id,
            notification_types=[NotificationType.TASK_DISPATCHED]
        )
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to mark notifications as read: {str(e)}")
    
    # 发送通知（通知失败不影响主业务）
    try:
        notify_work_order_assigned(db, work_order)
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to send work order assignment notification: {str(e)}")

    if peer_cancelled_work_order_ids:
        try:
            peer_cancelled_orders = db.query(WorkOrder).options(
                joinedload(WorkOrder.task)
            ).filter(WorkOrder.id.in_(peer_cancelled_work_order_ids)).all()
            operator_name = current_user.real_name or current_user.username
            for peer_order in peer_cancelled_orders:
                notify_work_order_cancelled_by_peer_dispatch(
                    db=db,
                    work_order=peer_order,
                    operator_id=current_user.id,
                    operator_name=operator_name,
                )
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to send peer cancelled notifications: {str(e)}")
    
    # 记录操作日志
    try:
        log_work_order_action(
            db=db,
            user_id=current_user.id,
            action=AuditAction.ASSIGN,
            work_order_id=work_order.id,
            description=f"转派工单：{work_order.work_order_no}，成员：{member.real_name or member.username}",
            details={
                "member_id": assign_data.member_id,
                "task_name": work_order.task.task_name if work_order.task else None
            },
            request=request
        )
        # 提交操作日志
        db.commit()
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to log work order assignment action: {str(e)}")
        # 操作日志记录失败不影响主业务，继续执行
    
    # 重新加载关联数据
    work_order = db.query(WorkOrder).options(
        joinedload(WorkOrder.task),
        joinedload(WorkOrder.team_leader),
        joinedload(WorkOrder.member),
        joinedload(WorkOrder.detail_requirement).joinedload(TaskDetailRequirement.sales_contact)
    ).filter(WorkOrder.id == work_order.id).first()
    
    return enrich_work_order_response(work_order, db)


@router.put("/{work_order_id}/team-leader", response_model=WorkOrderResponse)
def update_work_order_team_leader(
    work_order_id: int,
    update_data: WorkOrderTeamLeaderUpdate,
    request: Request,
    user_role: tuple = Depends(require_role(UserRole.MANAGER)),
    db: Session = Depends(get_db)
):
    """修改工单组长（总管）"""
    current_user, current_role = user_role
    
    # 获取工单及其关联数据
    work_order = db.query(WorkOrder).options(
        joinedload(WorkOrder.task),
        joinedload(WorkOrder.team_leader),
        joinedload(WorkOrder.member),
        joinedload(WorkOrder.detail_requirement)
    ).filter(WorkOrder.id == work_order_id).first()
    
    if not work_order:
        raise HTTPException(status_code=404, detail="工单不存在")
    
    # 验证工单状态：允许在 PENDING_GROUP_CLAIM、PENDING_ASSIGN、PENDING_ACCEPT、ACCEPTED 状态时修改
    # 禁止在 IN_PROGRESS、COMPLETED、CANCELLED 状态时修改
    allowed_statuses = [
        WorkOrderStatus.PENDING_GROUP_CLAIM.value,
        WorkOrderStatus.PENDING_ASSIGN.value,
        WorkOrderStatus.PENDING_ACCEPT.value,
        WorkOrderStatus.ACCEPTED.value
    ]
    if work_order.status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"工单状态为 {work_order.status}，无法修改组长。只有待转派、待接单或已接单状态的工单才能修改组长"
        )
    
    # 验证新组长是否与原组长相同（待认领时原组长为空）
    if (
        work_order.team_leader_id is not None
        and work_order.team_leader_id == update_data.team_leader_id
    ):
        raise HTTPException(status_code=400, detail="新组长与原组长相同，无需修改")
    
    # 验证新组长是否存在且角色正确
    from app.models.user import UserRoleAssociation
    new_team_leader = db.query(User).filter(User.id == update_data.team_leader_id).first()
    if not new_team_leader:
        raise HTTPException(status_code=404, detail="新组长不存在")
    
    if not new_team_leader.is_active:
        raise HTTPException(status_code=400, detail="新组长已被禁用")
    
    # 检查用户是否有组长角色且已审核通过、活跃
    team_leader_role = db.query(UserRoleAssociation).filter(
        UserRoleAssociation.user_id == update_data.team_leader_id,
        UserRoleAssociation.role == UserRole.TEAM_LEADER,
        UserRoleAssociation.approval_status == "approved",
        UserRoleAssociation.is_active == True
    ).first()
    
    if not team_leader_role:
        raise HTTPException(status_code=400, detail="新组长不存在或角色不正确")
    
    # 保存原信息（用于通知和日志）
    old_team_leader_id = work_order.team_leader_id
    old_team_leader_name = work_order.team_leader.real_name or work_order.team_leader.username if work_order.team_leader else None
    old_member_id = work_order.member_id
    old_member_name = work_order.member.real_name or work_order.member.username if work_order.member else None
    old_status = work_order.status
    
    # 如果工单已转派或已接单，需要清空成员关系并重置状态
    if old_status in [WorkOrderStatus.PENDING_ACCEPT.value, WorkOrderStatus.ACCEPTED.value]:
        work_order.member_id = None
        work_order.status = WorkOrderStatus.PENDING_ASSIGN.value
        # 如果已接单，清空接单时间
        if old_status == WorkOrderStatus.ACCEPTED.value:
            work_order.accepted_at = None
    
    # 更新工单组长（待认领状态由总管直接指定组长时，一并进入待转派）
    work_order.team_leader_id = update_data.team_leader_id
    if work_order.status == WorkOrderStatus.PENDING_GROUP_CLAIM.value:
        work_order.status = WorkOrderStatus.PENDING_ASSIGN.value

    db.commit()
    db.refresh(work_order)
    
    # 重新加载关联数据以获取新组长信息
    work_order = db.query(WorkOrder).options(
        joinedload(WorkOrder.task),
        joinedload(WorkOrder.team_leader),
        joinedload(WorkOrder.member),
        joinedload(WorkOrder.detail_requirement).joinedload(TaskDetailRequirement.sales_contact)
    ).filter(WorkOrder.id == work_order.id).first()
    
    new_team_leader_name = work_order.team_leader.real_name or work_order.team_leader.username if work_order.team_leader else None
    
    # 通知处理
    # 1. 如果已转派或已接单，通知原成员（工单已撤回）
    if old_member_id:
        try:
            notify_work_order_revoked_by_team_leader_change(db, work_order, old_member_id)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to send work order revoked notification: {str(e)}")
    
    # 2. 通知原组长（工单已重新分配；待认领时无原组长则跳过）
    if old_team_leader_id and old_team_leader_id != update_data.team_leader_id:
        try:
            notify_work_order_team_leader_changed(db, work_order, old_team_leader_id)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to send team leader changed notification: {str(e)}")
    
    # 3. 通知新组长（工单已派单）
    if work_order.task:
        try:
            notify_task_dispatched(db, work_order.task, update_data.team_leader_id, work_order.id)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to send task dispatched notification: {str(e)}")
    
    # 记录操作日志
    description = f"修改工单组长：{work_order.work_order_no}，从「{old_team_leader_name}」改为「{new_team_leader_name}」"
    if old_status in [WorkOrderStatus.PENDING_ACCEPT.value, WorkOrderStatus.ACCEPTED.value]:
        description += f"，已清空成员关系并重置状态为待转派"
    if update_data.reason:
        description += f"，原因：{update_data.reason}"
    
    try:
        log_work_order_action(
            db=db,
            user_id=current_user.id,
            action=AuditAction.UPDATE,
            work_order_id=work_order.id,
            description=description,
            details={
                "old_team_leader_id": old_team_leader_id,
                "new_team_leader_id": update_data.team_leader_id,
                "old_team_leader_name": old_team_leader_name,
                "new_team_leader_name": new_team_leader_name,
                "old_member_id": old_member_id,
                "old_member_name": old_member_name,
                "old_status": old_status,
                "new_status": work_order.status,
                "reason": update_data.reason,
                "task_name": work_order.task.task_name if work_order.task else None
            },
            request=request
        )
        # 提交操作日志
        db.commit()
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to log work order team leader update action: {str(e)}")
        # 操作日志记录失败不影响主业务，继续执行
    
    return enrich_work_order_response(work_order, db)


@router.post("/{work_order_id}/accept", response_model=WorkOrderResponse)
def accept_work_order_by_member(
    work_order_id: int,
    request: Request,
    user_role: tuple = Depends(require_role(UserRole.MEMBER)),
    db: Session = Depends(get_db)
):
    """接单（成员）"""
    current_user, current_role = user_role
    work_order = db.query(WorkOrder).options(
        joinedload(WorkOrder.task)
    ).filter(WorkOrder.id == work_order_id).first()
    if not work_order:
        raise HTTPException(status_code=404, detail="工单不存在")
    
    if work_order.member_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权操作此工单")
    
    try:
        work_order = accept_work_order(db, work_order, current_user.id)
        
        # 自动标记相关通知为已读（用户通过待办列表处理事项时，通知应自动标记为已读）
        try:
            mark_notifications_as_read_by_resource(
                db=db,
                user_id=current_user.id,
                resource_type="work_order",
                resource_id=work_order.id,
                notification_types=[NotificationType.WORK_ORDER_ASSIGNED]
            )
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to mark notifications as read: {str(e)}")
        
        # 发送通知（通知失败不影响主业务）
        try:
            notify_work_order_accepted(db, work_order)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to send work order accepted notification: {str(e)}")
        
        # 记录操作日志
        log_work_order_action(
            db=db,
            user_id=current_user.id,
            action=AuditAction.ACCEPT,
            work_order_id=work_order.id,
            description=f"接单：{work_order.work_order_no}",
            details={
                "task_name": work_order.task.task_name if work_order.task else None,
                "work_order_no": work_order.work_order_no
            },
            request=request
        )
        
        # 统一提交事务
        db.commit()
        
        # 重新加载关联数据
        work_order = db.query(WorkOrder).options(
            joinedload(WorkOrder.task),
            joinedload(WorkOrder.team_leader),
            joinedload(WorkOrder.member)
        ).filter(WorkOrder.id == work_order.id).first()
        
        return enrich_work_order_response(work_order, db)
    except WorkflowError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"接单失败：{str(e)}")


@router.get(
    "/{work_order_id}/transfer/intra-group-members",
    response_model=List[IntraGroupTransferMemberItem],
)
def get_intra_group_transfer_candidates(
    work_order_id: int,
    user_role: tuple = Depends(require_role(UserRole.MEMBER)),
    db: Session = Depends(get_db),
):
    """成员转单「转给组内成员」时的候选列表（仅含本组组长所属组内、已审核成员角色用户，不含自己）。"""
    current_user, _ = user_role
    work_order = db.query(WorkOrder).filter(WorkOrder.id == work_order_id).first()
    if not work_order:
        raise HTTPException(status_code=404, detail="工单不存在")
    if work_order.member_id != current_user.id:
        raise HTTPException(status_code=403, detail="只能查看本人已接单工单的转单目标")
    if work_order.status != WorkOrderStatus.ACCEPTED.value:
        raise HTTPException(status_code=400, detail="仅已接单状态可查看组内转单对象")

    from app.models.group import Group, group_leaders
    from sqlalchemy import or_

    current_group = (
        db.query(Group)
        .options(joinedload(Group.members))
        .join(group_leaders, Group.id == group_leaders.c.group_id, isouter=True)
        .filter(
            or_(
                Group.leader_id == work_order.team_leader_id,
                group_leaders.c.user_id == work_order.team_leader_id,
            )
        )
        .distinct()
        .first()
    )
    if not current_group:
        return []

    member_ids = {m.id for m in current_group.members}
    if not member_ids:
        return []

    rows = (
        db.query(User.id, User.username, User.real_name)
        .join(
            UserRoleAssociation,
            UserRoleAssociation.user_id == User.id,
        )
        .filter(
            User.id.in_(member_ids),
            User.id != current_user.id,
            User.is_active == True,
            UserRoleAssociation.role == UserRole.MEMBER,
            UserRoleAssociation.approval_status == "approved",
            UserRoleAssociation.is_active == True,
        )
        .distinct()
        .order_by(User.real_name, User.username)
        .all()
    )
    return [
        IntraGroupTransferMemberItem(
            id=r[0],
            username=r[1],
            real_name=(r[2] or r[1] or ""),
        )
        for r in rows
    ]


@router.post("/{work_order_id}/transfer", response_model=WorkOrderResponse)
def transfer_work_order_by_member(
    work_order_id: int,
    transfer_data: WorkOrderTransfer,
    request: Request,
    user_role: tuple = Depends(require_role(UserRole.MEMBER)),
    db: Session = Depends(get_db)
):
    """成员转单（仅已接单）"""
    current_user, _ = user_role
    work_order = db.query(WorkOrder).options(
        joinedload(WorkOrder.task),
        joinedload(WorkOrder.team_leader),
        joinedload(WorkOrder.member),
    ).filter(WorkOrder.id == work_order_id).first()
    if not work_order:
        raise HTTPException(status_code=404, detail="工单不存在")

    if work_order.member_id != current_user.id:
        raise HTTPException(status_code=403, detail="只能转单本人已接单的工单")

    if work_order.status != WorkOrderStatus.ACCEPTED.value:
        raise HTTPException(status_code=400, detail="仅已接单状态可转单")

    if transfer_data.target_user_id == current_user.id:
        raise HTTPException(status_code=400, detail="不能转给自己")

    from app.models.user import UserRoleAssociation
    from app.models.group import Group, group_leaders
    from sqlalchemy import or_

    # 当前工单所属组（按当前组长反查）
    current_group = db.query(Group).options(
        joinedload(Group.members)
    ).join(
        group_leaders, Group.id == group_leaders.c.group_id, isouter=True
    ).filter(
        or_(Group.leader_id == work_order.team_leader_id, group_leaders.c.user_id == work_order.team_leader_id)
    ).distinct().first()

    old_member_id = work_order.member_id
    old_member_name = work_order.member.real_name or work_order.member.username if work_order.member else None
    old_team_leader_id = work_order.team_leader_id
    old_team_leader_name = (
        work_order.team_leader.real_name or work_order.team_leader.username if work_order.team_leader else None
    )
    old_status = work_order.status

    target_user = db.query(User).filter(User.id == transfer_data.target_user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="目标用户不存在")
    if not target_user.is_active:
        raise HTTPException(status_code=400, detail="目标用户已被禁用")

    transfer_mode = transfer_data.target_type
    target_member_id = None
    target_team_leader_id = None

    if transfer_mode == "member":
        target_member_role = db.query(UserRoleAssociation).filter(
            UserRoleAssociation.user_id == transfer_data.target_user_id,
            UserRoleAssociation.role == UserRole.MEMBER,
            UserRoleAssociation.approval_status == "approved",
            UserRoleAssociation.is_active == True
        ).first()
        if not target_member_role:
            raise HTTPException(status_code=400, detail="目标用户不是有效成员")

        if not current_group:
            raise HTTPException(status_code=400, detail="当前工单组长未配置组，无法转给组内成员")

        member_ids = [m.id for m in current_group.members]
        if transfer_data.target_user_id not in member_ids:
            raise HTTPException(status_code=403, detail="同组转单只能转给当前组内成员")

        work_order.member_id = transfer_data.target_user_id
        work_order.status = WorkOrderStatus.PENDING_ACCEPT.value
        work_order.accepted_at = None
        target_member_id = transfer_data.target_user_id

    elif transfer_mode == "team_leader":
        target_leader_role = db.query(UserRoleAssociation).filter(
            UserRoleAssociation.user_id == transfer_data.target_user_id,
            UserRoleAssociation.role == UserRole.TEAM_LEADER,
            UserRoleAssociation.approval_status == "approved",
            UserRoleAssociation.is_active == True
        ).first()
        if not target_leader_role:
            raise HTTPException(status_code=400, detail="目标用户不是有效组长")
        if transfer_data.target_user_id == work_order.team_leader_id:
            raise HTTPException(status_code=400, detail="跨组转单需转给其他组组长")

        work_order.team_leader_id = transfer_data.target_user_id
        work_order.member_id = None
        work_order.status = WorkOrderStatus.PENDING_ASSIGN.value
        work_order.accepted_at = None
        target_team_leader_id = transfer_data.target_user_id
    else:
        raise HTTPException(status_code=400, detail="不支持的转单类型")

    db.commit()
    db.refresh(work_order)

    # 重新加载关联数据以保证通知文案与响应数据完整
    work_order = db.query(WorkOrder).options(
        joinedload(WorkOrder.task),
        joinedload(WorkOrder.team_leader),
        joinedload(WorkOrder.member),
        joinedload(WorkOrder.detail_requirement).joinedload(TaskDetailRequirement.sales_contact)
    ).filter(WorkOrder.id == work_order.id).first()

    # 通知
    try:
        notify_work_order_transferred_by_member(
            db=db,
            work_order=work_order,
            old_team_leader_id=old_team_leader_id,
            old_member_id=old_member_id,
            target_mode=transfer_mode,
            target_member_id=target_member_id,
            target_team_leader_id=target_team_leader_id,
            operator_id=current_user.id,
        )
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to send work order transfer notifications: {str(e)}")

    # 操作日志
    target_name = target_user.real_name or target_user.username
    transfer_label = "组内成员" if transfer_mode == "member" else "其他组组长"
    description = f"成员转单：{work_order.work_order_no}，转给{transfer_label}「{target_name}」"
    if transfer_data.reason:
        description += f"，原因：{transfer_data.reason}"
    try:
        log_work_order_action(
            db=db,
            user_id=current_user.id,
            action=AuditAction.UPDATE,
            work_order_id=work_order.id,
            description=description,
            details={
                "old_member_id": old_member_id,
                "old_member_name": old_member_name,
                "old_team_leader_id": old_team_leader_id,
                "old_team_leader_name": old_team_leader_name,
                "old_status": old_status,
                "target_mode": transfer_mode,
                "target_user_id": transfer_data.target_user_id,
                "target_user_name": target_name,
                "new_team_leader_id": work_order.team_leader_id,
                "new_member_id": work_order.member_id,
                "new_status": work_order.status,
                "reason": transfer_data.reason,
            },
            request=request
        )
        db.commit()
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to log work order transfer action: {str(e)}")

    return enrich_work_order_response(work_order, db)


@router.post("/{work_order_id}/complete", response_model=WorkOrderResponse)
def complete_work_order(
    work_order_id: int,
    request: Request,
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """标记工单为已拜访（成员或组长）"""
    current_user, current_role = user_role
    work_order = db.query(WorkOrder).options(
        joinedload(WorkOrder.task)
    ).filter(WorkOrder.id == work_order_id).first()
    
    if not work_order:
        raise HTTPException(status_code=404, detail="工单不存在")
    
    # 权限检查：成员只能标记本人工单，组长可标记本团队工单
    if current_role.role == UserRole.MEMBER:
        if work_order.member_id != current_user.id:
            raise HTTPException(status_code=403, detail="只能将本人负责工单标记为已拜访")
    elif current_role.role == UserRole.TEAM_LEADER:
        peer_ids = get_peer_team_leader_ids(db, current_user.id)
        if work_order.team_leader_id not in peer_ids:
            raise HTTPException(status_code=403, detail="只能将本团队工单标记为已拜访")
    else:
        raise HTTPException(status_code=403, detail="只有成员和组长可以将工单标记为已拜访")
    
    # 已接单：必须通过「拜访完成」创建拜访日志后自动变为已拜访，不再提供本接口
    if work_order.status == WorkOrderStatus.ACCEPTED.value:
        raise HTTPException(
            status_code=400,
            detail="请通过工单列表中的「拜访完成」进入添加拜访日志，提交后工单将自动变为已拜访",
        )
    # 兼容历史数据：仅允许「进行中」工单通过本接口补标记为已拜访（无二次拜访日志入口时）
    if work_order.status != WorkOrderStatus.IN_PROGRESS.value:
        raise HTTPException(
            status_code=400,
            detail=f"工单状态为 {work_order.status}，无法标记为已拜访。已接单工单请通过拜访日志完成；进行中工单可使用本接口补全",
        )

    old_status = work_order.status
    work_order.status = WorkOrderStatus.COMPLETED.value
    set_work_order_completed_at_if_missing(work_order)

    if work_order.task:
        from app.core.workflow import check_and_update_task_completion_status

        check_and_update_task_completion_status(db, work_order.task)

    db.commit()
    db.refresh(work_order)

    post_commit_work_order_completed_followup(
        db,
        work_order,
        actor_user_id=current_user.id,
        request=request,
        old_status=old_status,
        audit_description=f"标记工单已拜访：{work_order.work_order_no}",
        audit_trigger="work_order_complete_api",
    )

    # 重新加载关联数据
    work_order = db.query(WorkOrder).options(
        joinedload(WorkOrder.task),
        joinedload(WorkOrder.team_leader),
        joinedload(WorkOrder.member),
        joinedload(WorkOrder.detail_requirement).joinedload(TaskDetailRequirement.sales_contact)
    ).filter(WorkOrder.id == work_order.id).first()
    
    return enrich_work_order_response(work_order, db)


@router.post("/{work_order_id}/cancel", response_model=WorkOrderResponse)
def cancel_work_order(
    work_order_id: int,
    cancel_data: WorkOrderCancel,
    request: Request,
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """取消工单（组长或成员）"""
    from datetime import datetime
    
    current_user, current_role = user_role
    work_order = db.query(WorkOrder).options(
        joinedload(WorkOrder.task)
    ).filter(WorkOrder.id == work_order_id).first()
    
    if not work_order:
        raise HTTPException(status_code=404, detail="工单不存在")
    
    # 检查工单状态：已取消或已拜访的工单不能再取消
    if work_order.status == WorkOrderStatus.CANCELLED.value:
        raise HTTPException(status_code=400, detail="工单已取消，无法重复取消")
    
    if work_order.status == WorkOrderStatus.COMPLETED.value:
        raise HTTPException(status_code=400, detail="工单已拜访，无法取消")
    
    # 权限检查：组长和成员可以取消工单
    if current_role.role == UserRole.TEAM_LEADER:
        if not can_manage_work_order(current_role.role, current_user.id, work_order, db=db):
            raise HTTPException(status_code=403, detail="只能取消自己团队可见范围内的工单")
        # 组长可以取消的状态：待认领、待转派或待接单
        if work_order.status not in [
            WorkOrderStatus.PENDING_GROUP_CLAIM.value,
            WorkOrderStatus.PENDING_ASSIGN.value,
            WorkOrderStatus.PENDING_ACCEPT.value,
        ]:
            raise HTTPException(
                status_code=400,
                detail=f"工单状态为 {work_order.status}，组长只能取消待认领、待转派或待接单状态的工单"
            )
    elif current_role.role == UserRole.MEMBER:
        # 成员只能取消自己的工单
        if work_order.member_id != current_user.id:
            raise HTTPException(status_code=403, detail="只能取消自己的工单")
        # 成员可以取消的状态：pending_accept、accepted 或 in_progress
        if work_order.status not in [
            WorkOrderStatus.PENDING_ACCEPT.value,
            WorkOrderStatus.ACCEPTED.value,
            WorkOrderStatus.IN_PROGRESS.value
        ]:
            raise HTTPException(
                status_code=400,
                detail=f"工单状态为 {work_order.status}，成员只能取消待接单、已接单或进行中状态的工单"
            )
    else:
        raise HTTPException(status_code=403, detail="只有组长和成员可以取消工单")
    
    # 更新工单状态为已取消
    old_status = work_order.status
    work_order.status = WorkOrderStatus.CANCELLED.value
    work_order.cancelled_at = datetime.utcnow()
    work_order.cancellation_reason = cancel_data.cancellation_reason
    
    # 检查任务状态是否需要更新（如果所有工单都被取消，且任务状态是 IN_PROGRESS，应该回退）
    if work_order.task:
        from app.core.workflow import check_and_update_task_status_after_work_order_cancellation
        check_and_update_task_status_after_work_order_cancellation(db, work_order.task)
    
    db.commit()
    db.refresh(work_order)
    
    # 发送通知（通知失败不影响主业务流程）
    try:
        notify_work_order_cancelled(db, work_order, current_user.id)
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to send work order cancellation notification: {str(e)}")
    
    # 记录操作日志
    description = f"取消工单：{work_order.work_order_no}"
    if cancel_data.cancellation_reason:
        description += f"，取消原因：{cancel_data.cancellation_reason}"
    
    # 记录操作日志
    try:
        log_work_order_action(
            db=db,
            user_id=current_user.id,
            action=AuditAction.UPDATE,
            work_order_id=work_order.id,
            description=description,
            details={
                "old_status": old_status,
                "new_status": WorkOrderStatus.CANCELLED.value,
                "cancellation_reason": cancel_data.cancellation_reason,
                "task_name": work_order.task.task_name if work_order.task else None
            },
            request=request
        )
        # 提交操作日志
        db.commit()
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to log work order cancellation action: {str(e)}")
        # 操作日志记录失败不影响主业务，继续执行
    
    # 重新加载关联数据
    work_order = db.query(WorkOrder).options(
        joinedload(WorkOrder.task),
        joinedload(WorkOrder.team_leader),
        joinedload(WorkOrder.member),
        joinedload(WorkOrder.detail_requirement).joinedload(TaskDetailRequirement.sales_contact)
    ).filter(WorkOrder.id == work_order.id).first()
    
    return enrich_work_order_response(work_order, db)


@router.post("/{work_order_id}/revoke", response_model=WorkOrderResponse)
def revoke_work_order(
    work_order_id: int,
    request: Request,
    user_role: tuple = Depends(require_role(UserRole.TEAM_LEADER)),
    db: Session = Depends(get_db)
):
    """撤回工单转派（组长）"""
    current_user, current_role = user_role
    
    # 获取工单及其关联数据
    work_order = db.query(WorkOrder).options(
        joinedload(WorkOrder.task),
        joinedload(WorkOrder.team_leader),
        joinedload(WorkOrder.member),
        joinedload(WorkOrder.detail_requirement)
    ).filter(WorkOrder.id == work_order_id).first()
    
    if not work_order:
        raise HTTPException(status_code=404, detail="工单不存在")
    
    if not can_manage_work_order(current_role.role, current_user.id, work_order, db=db):
        raise HTTPException(status_code=403, detail="只能撤回自己团队的工单")

    # 检查工单是否有成员（如果没有成员，无需撤回）
    if not work_order.member_id:
        raise HTTPException(status_code=400, detail="工单未转派给成员，无需撤回")
    
    # 状态检查：允许在 PENDING_ACCEPT 或 ACCEPTED 状态时撤回
    # 禁止在 IN_PROGRESS、COMPLETED、CANCELLED 状态时撤回
    allowed_statuses = [
        WorkOrderStatus.PENDING_ACCEPT.value,
        WorkOrderStatus.ACCEPTED.value
    ]
    if work_order.status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"工单状态为 {work_order.status}，无法撤回。只有待接单或已接单状态的工单才能撤回"
        )
    
    # 保存原成员信息（用于通知和日志）
    old_member_id = work_order.member_id
    old_member_name = work_order.member.real_name or work_order.member.username if work_order.member else None
    old_status = work_order.status
    
    # 撤回操作：清空成员关系并重置状态
    work_order.member_id = None
    if work_order.status == WorkOrderStatus.ACCEPTED.value:
        work_order.accepted_at = None
    work_order.status = WorkOrderStatus.PENDING_ASSIGN.value
    
    # 提交事务
    db.commit()
    db.refresh(work_order)
    
    # 通知原成员（工单已撤回）
    try:
        notify_work_order_revoked(db, work_order, old_member_id)
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to send work order revoked notification: {str(e)}")
    
    # 记录操作日志
    description = f"撤回工单：{work_order.work_order_no}"
    if old_member_name:
        description += f"，原成员：{old_member_name}"
    if old_status == WorkOrderStatus.ACCEPTED.value:
        description += "（成员已接单）"
    
    try:
        log_work_order_action(
            db=db,
            user_id=current_user.id,
            action=AuditAction.UPDATE,
            work_order_id=work_order.id,
            description=description,
            details={
                "old_member_id": old_member_id,
                "old_member_name": old_member_name,
                "old_status": old_status,
                "new_status": work_order.status,
                "task_name": work_order.task.task_name if work_order.task else None
            },
            request=request
        )
        # 提交操作日志
        db.commit()
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to log work order revoke action: {str(e)}")
        # 操作日志记录失败不影响主业务，继续执行
    
    # 重新加载关联数据
    work_order = db.query(WorkOrder).options(
        joinedload(WorkOrder.task),
        joinedload(WorkOrder.team_leader),
        joinedload(WorkOrder.member),
        joinedload(WorkOrder.detail_requirement).joinedload(TaskDetailRequirement.sales_contact)
    ).filter(WorkOrder.id == work_order.id).first()
    
    return enrich_work_order_response(work_order, db)

