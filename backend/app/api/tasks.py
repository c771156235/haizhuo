"""
任务管理 API
"""
from typing import List, Optional, Set, Tuple
import re
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from urllib.parse import quote
from app.database import get_db
from app.models.user import User, UserRole, UserRoleAssociation
from app.models.task import Task, TaskStatus, TaskDetailRequirement
from app.schemas.task import (
    TaskCreate, TaskUpdate, TaskDetailUpdate, TaskConfirm, TaskClose, DetailRequirementDispatch, TaskResponse,
    TaskDetailRequirementResponse, BatchImportResponse
)
from app.schemas.common import PaginationParams, PaginatedResponse
from app.api.deps import get_current_user, get_current_role, require_role
from app.core.workflow import (
    confirm_task,
    reject_task,
    submit_detail_requirement,
    check_and_update_task_dispatch_status,
    close_task,
    revoke_task,
    WorkflowError,
    first_active_work_order_for_detail_requirement,
)
from app.core.permissions import can_view_task, can_edit_task
from app.core.audit import log_task_action
from app.models.audit_log import AuditAction, AuditLog, AuditResource
from app.services.notification_service import (
    notify_task_pending, 
    notify_task_confirmed, 
    notify_task_rejected, 
    notify_task_detail_submitted, 
    notify_task_dispatched,
    notify_work_order_pool_dispatch,
    notify_task_revoked,
    mark_notifications_as_read_by_resource
)
from app.models.notification import NotificationType
from app.services.excel_service import generate_detail_requirement_template, parse_detail_requirement_excel
from app.utils.sales_unit_utils import sales_contact_can_choose_customer_source
from app.utils.team_leader_peer_scope import get_peer_team_leader_ids
from app.utils.work_order_pool import resolve_dispatch_group_id_from_leader_ids
from fastapi import Request

router = APIRouter(prefix="/tasks", tags=["任务管理"])

AUTO_DISPATCH_GROUP_NAME_ALIASES = {
    "A": ["A组", "A 组"],
    "B": ["B组", "B 组"],
    "C": ["C组", "C 组"],
}

AUTO_DISPATCH_B_KEYWORDS = {"北区", "中区", "金山", "奉贤", "浦东", "东区", "松江"}
AUTO_DISPATCH_C_KEYWORDS = {"南区", "西区", "宝山", "莘闵", "嘉定", "青浦", "崇明"}


def _normalize_customer_source(customer_source: str) -> str:
    if not customer_source:
        return ""
    text = str(customer_source).strip()
    # 兼容“销售单位 - xx / 销售单位-xx / 销售单位－xx”等格式
    text = re.sub(r"^销售单位\s*[-－]\s*", "", text)
    return text.strip()


def _match_auto_dispatch_group_code(customer_source: str) -> Optional[str]:
    source = _normalize_customer_source(customer_source)
    if not source:
        return None

    # A组优先：所有 BD 类来源（包含英文 BD）
    if "BD" in source.upper():
        return "A"

    if source in AUTO_DISPATCH_B_KEYWORDS:
        return "B"
    if source in AUTO_DISPATCH_C_KEYWORDS:
        return "C"
    return None


def _get_valid_team_leader_ids_from_group(db: Session, group) -> List[int]:
    """提取组内全部有效组长ID（兼容 leader_id 与 group_leaders）。"""
    from app.models.user import UserRoleAssociation

    candidate_ids = set()
    if getattr(group, "leader_id", None):
        candidate_ids.add(group.leader_id)
    for leader in getattr(group, "leaders", []) or []:
        if leader and leader.id:
            candidate_ids.add(leader.id)

    if not candidate_ids:
        return []

    approved_ids = set(
        row[0]
        for row in db.query(UserRoleAssociation.user_id).filter(
            UserRoleAssociation.user_id.in_(list(candidate_ids)),
            UserRoleAssociation.role == UserRole.TEAM_LEADER,
            UserRoleAssociation.approval_status == "approved",
            UserRoleAssociation.is_active == True
        ).distinct().all()
    )

    if not approved_ids:
        return []

    active_user_ids = set(
        row[0]
        for row in db.query(User.id).filter(
            User.id.in_(list(approved_ids)),
            User.is_active == True
        ).all()
    )
    return sorted(active_user_ids)


def _resolve_auto_dispatch_team_leader_ids(db: Session, group_code: str) -> List[int]:
    from app.models.group import Group

    aliases = AUTO_DISPATCH_GROUP_NAME_ALIASES.get(group_code, [])
    if not aliases:
        return []
    group = db.query(Group).filter(Group.name.in_(aliases)).first()
    if not group:
        return []
    return _get_valid_team_leader_ids_from_group(db, group)


def _resolve_group_team_leader_ids_by_any_leader(db: Session, any_team_leader_id: int) -> List[int]:
    """通过任意组长ID定位其组，并返回该组全部有效组长ID。"""
    from sqlalchemy import or_
    from app.models.group import Group, group_leaders

    group = db.query(Group).join(
        group_leaders, Group.id == group_leaders.c.group_id, isouter=True
    ).filter(
        or_(Group.leader_id == any_team_leader_id, group_leaders.c.user_id == any_team_leader_id)
    ).distinct().first()
    if not group:
        return []
    return _get_valid_team_leader_ids_from_group(db, group)


def _dispatch_detail_requirement_internal(
    *,
    db: Session,
    task: Task,
    detail_requirement: TaskDetailRequirement,
    team_leader_ids: List[int],
    operator_user_id: int,
    request: Request,
    mark_detail_submitted_read: bool,
    is_auto_dispatch: bool,
    auto_dispatch_reason: Optional[str] = None,
) -> dict:
    """详细需求派单内核（手动与自动复用）"""
    from datetime import datetime
    from app.models.work_order import WorkOrder, WorkOrderStatus

    if not team_leader_ids:
        raise HTTPException(status_code=400, detail="目标组无可用组长，无法派单")

    if task.status == TaskStatus.CANCELLED:
        raise HTTPException(status_code=400, detail="任务已关闭，无法派单")

    target_leader_users = db.query(User).filter(User.id.in_(team_leader_ids)).all()
    target_leader_user_map = {u.id: u for u in target_leader_users if u and u.is_active}

    valid_role_ids = set(
        row[0] for row in db.query(UserRoleAssociation.user_id).filter(
            UserRoleAssociation.user_id.in_(team_leader_ids),
            UserRoleAssociation.role == UserRole.TEAM_LEADER,
            UserRoleAssociation.approval_status == "approved",
            UserRoleAssociation.is_active == True
        ).distinct().all()
    )
    valid_team_leader_ids = [lid for lid in team_leader_ids if lid in target_leader_user_map and lid in valid_role_ids]
    if not valid_team_leader_ids:
        raise HTTPException(status_code=404, detail="目标组长不存在或角色不正确")

    dup = (
        db.query(WorkOrder.id)
        .filter(
            WorkOrder.detail_requirement_id == detail_requirement.id,
            WorkOrder.status != WorkOrderStatus.CANCELLED.value,
        )
        .first()
    )
    if dup:
        raise HTTPException(status_code=400, detail="该详细需求已有未关闭工单，无需重复派单")

    dispatch_group_id = resolve_dispatch_group_id_from_leader_ids(db, valid_team_leader_ids)
    if not dispatch_group_id:
        raise HTTPException(status_code=400, detail="无法解析派单目标组，请检查组长与组的关联")

    ts = int(datetime.utcnow().timestamp())
    work_order_no = f"WO{task.id}-R{detail_requirement.id}-G{dispatch_group_id}-{ts}"
    work_order = WorkOrder(
        work_order_no=work_order_no,
        task_id=task.id,
        detail_requirement_id=detail_requirement.id,
        dispatch_group_id=dispatch_group_id,
        team_leader_id=None,
        status=WorkOrderStatus.PENDING_GROUP_CLAIM.value,
    )
    db.add(work_order)
    db.flush()
    work_orders = [work_order]
    created_leader_ids = list(valid_team_leader_ids)

    task = check_and_update_task_dispatch_status(db, task)
    db.commit()
    db.refresh(work_order)

    if mark_detail_submitted_read:
        try:
            mark_notifications_as_read_by_resource(
                db=db,
                user_id=operator_user_id,
                resource_type="task",
                resource_id=task.id,
                notification_types=[NotificationType.TASK_DETAIL_SUBMITTED]
            )
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to mark notifications as read: {str(e)}")

    try:
        for leader_id in valid_team_leader_ids:
            notify_work_order_pool_dispatch(db, task, leader_id, work_order.id)
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to send pool dispatch notifications: {str(e)}")

    leader_names = [
        target_leader_user_map[lid].real_name or target_leader_user_map[lid].username
        for lid in created_leader_ids
        if lid in target_leader_user_map
    ]
    description = f"派单详细需求：{detail_requirement.customer_unit}（{task.task_name}），组长：{', '.join(leader_names)}"
    if is_auto_dispatch:
        description = f"自动派单详细需求：{detail_requirement.customer_unit}（{task.task_name}），组长：{', '.join(leader_names)}"
        if auto_dispatch_reason:
            description += f"，匹配规则：{auto_dispatch_reason}"
    log_task_action(
        db=db,
        user_id=operator_user_id,
        action=AuditAction.DISPATCH,
        task_id=task.id,
        description=description,
        details={
            "team_leader_ids": created_leader_ids,
            "work_order_ids": [wo.id for wo in work_orders],
            "detail_requirement_id": detail_requirement.id,
            "customer_unit": detail_requirement.customer_unit,
            "auto_dispatch": is_auto_dispatch,
            "auto_dispatch_reason": auto_dispatch_reason,
        },
        request=request
    )
    db.commit()

    return {
        "work_orders": work_orders,
        "task": task,
        "detail_requirement": detail_requirement
    }


def _try_auto_dispatch_detail_requirement(
    *,
    db: Session,
    task: Task,
    detail_requirement: TaskDetailRequirement,
    operator_user_id: int,
    request: Request,
) -> Tuple[bool, str]:
    """自动派单尝试：成功返回(True, reason)，失败/未命中返回(False, reason)。"""
    group_code = _match_auto_dispatch_group_code(detail_requirement.customer_source or "")
    if not group_code:
        return False, "unmatched_customer_source"

    team_leader_ids = _resolve_auto_dispatch_team_leader_ids(db, group_code)
    if not team_leader_ids:
        return False, f"group_{group_code}_leader_not_found"

    try:
        _dispatch_detail_requirement_internal(
            db=db,
            task=task,
            detail_requirement=detail_requirement,
            team_leader_ids=team_leader_ids,
            operator_user_id=operator_user_id,
            request=request,
            mark_detail_submitted_read=False,
            is_auto_dispatch=True,
            auto_dispatch_reason=f"group_{group_code}",
        )
        return True, f"auto_dispatched_group_{group_code}_leaders_{len(team_leader_ids)}"
    except HTTPException as e:
        return False, f"auto_dispatch_rejected:{e.detail}"
    except Exception as e:
        db.rollback()
        return False, f"auto_dispatch_error:{str(e)}"


def _detail_requirement_ids_for_team_leader(db: Session, task_id: int, user_id: int) -> Set[int]:
    """组长在该任务下仅可见与其工单（含待认领池）关联的详细需求，与 can_view_task 中组长判定一致。"""
    from app.models.work_order import WorkOrder
    from app.utils.work_order_pool import team_leader_may_access_pool_work_order

    peer_ids = set(get_peer_team_leader_ids(db, user_id))
    ids: Set[int] = set()
    for wo in db.query(WorkOrder).filter(WorkOrder.task_id == task_id).all():
        if not wo.detail_requirement_id:
            continue
        if wo.team_leader_id and wo.team_leader_id in peer_ids:
            ids.add(wo.detail_requirement_id)
        elif team_leader_may_access_pool_work_order(db, user_id, wo):
            ids.add(wo.detail_requirement_id)
    return ids


def _detail_requirement_ids_for_member(db: Session, task_id: int, user_id: int) -> Set[int]:
    """成员仅可见分配给自己的工单所关联的详细需求。"""
    from app.models.work_order import WorkOrder

    rows = (
        db.query(WorkOrder.detail_requirement_id)
        .filter(
            WorkOrder.task_id == task_id,
            WorkOrder.member_id == user_id,
            WorkOrder.detail_requirement_id.isnot(None),
        )
        .distinct()
        .all()
    )
    return {r[0] for r in rows}


@router.post("", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
def create_task(
    task_data: TaskCreate,
    request: Request,
    user_role: tuple = Depends(require_role(UserRole.TASK_INITIATOR, UserRole.SALES_CONTACT)),
    db: Session = Depends(get_db)
):
    """
    发起简略要求（专项任务）
    支持两种发起方式：
    1. 区局（专项任务发起人）主动发起
    2. 销售单位接口人发起（需要具有发起权限）
    """
    current_user, current_role = user_role
    
    # 数据验证：sales_unit 不能为空
    if not task_data.sales_unit or not task_data.sales_unit.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="销售单位不能为空"
        )
    
    # 数据验证：fde_count 必须大于0
    if task_data.fde_count <= 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="FDE人数必须大于0"
        )
    
    # 数据验证：end_date 不能早于 start_date
    if task_data.end_date < task_data.start_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="结束日期不能早于开始日期"
        )
    
    # 如果是销售单位接口人发起任务，验证销售单位匹配
    if current_role.role == UserRole.SALES_CONTACT:
        user_sales_unit = current_role.sales_unit or current_user.sales_unit
        if user_sales_unit:
            # 检查任务的销售单位是否包含用户的销售单位
            task_sales_units = [unit.strip() for unit in task_data.sales_unit.split(',') if unit.strip()]
            sales_unit_matched = False
            for unit in task_sales_units:
                # 精确匹配
                if user_sales_unit == unit:
                    sales_unit_matched = True
                    break
                # 包含匹配：任务的销售单位包含用户的销售单位，或用户的销售单位包含任务的销售单位
                if user_sales_unit in unit or unit in user_sales_unit:
                    sales_unit_matched = True
                    break
            
            if not sales_unit_matched:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"您只能发起属于您销售单位（{user_sales_unit}）的任务。任务的销售单位必须包含您的销售单位。"
                )
    
    task = Task(
        **task_data.dict(),
        initiator_id=current_user.id,
        initiator_role=current_role.role.value,  # 记录创建时使用的角色
        status=TaskStatus.DRAFT  # 创建时状态为草稿，不发送通知
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    
    # 创建草稿任务时不发送通知，只有发起任务时才发送通知
    
    # 记录操作日志
    initiator_type = "销售单位接口人" if current_role.role == UserRole.SALES_CONTACT else "专项任务发起人"
    try:
        log_task_action(
            db=db,
            user_id=current_user.id,
            action=AuditAction.CREATE,
            task_id=task.id,
            description=f"创建任务：{task.task_name}（发起人类型：{initiator_type}）",
            request=request
        )
        # 提交操作日志事务
        db.commit()
    except Exception as e:
        # 操作日志记录失败不影响主业务
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to log task creation action: {str(e)}")
        # 如果提交失败，回滚操作日志相关的事务
        db.rollback()
    
    return task


@router.put("/{task_id}", response_model=TaskResponse)
def update_task(
    task_id: int,
    task_data: TaskUpdate,
    request: Request,
    user_role: tuple = Depends(require_role(UserRole.TASK_INITIATOR, UserRole.SALES_CONTACT)),
    db: Session = Depends(get_db)
):
    """
    更新任务
    - 草稿状态：允许修改所有字段
    - 已确认及之后状态：允许修改销售单位和FDE人数，但需要重新审批
    - 销售单位接口人：仅允许编辑本人创建的草稿任务，不可修改已确认及之后状态的任务
    """
    from app.models.work_order import WorkOrder, WorkOrderStatus
    
    current_user, current_role = user_role
    
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    # 只有创建者可以修改任务
    if task.initiator_id != current_user.id:
        raise HTTPException(status_code=403, detail="只有创建者可以修改任务")

    if current_role.role == UserRole.SALES_CONTACT and task.status != TaskStatus.DRAFT:
        raise HTTPException(
            status_code=403,
            detail="销售单位接口人不可修改非草稿状态的任务，请使用专项任务发起人角色修改已发布任务",
        )
    
    # 判断是否为已确认后的修改
    is_post_confirmed_update = task.status in (
        TaskStatus.CONFIRMED,
        TaskStatus.DETAIL_SUBMITTED,
        TaskStatus.DISPATCHED
    )
    
    # 不允许修改的状态
    if task.status in (TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED, TaskStatus.CANCELLED, TaskStatus.REJECTED):
        raise HTTPException(
            status_code=400,
            detail=f"任务状态为{task.status.value}，不允许修改"
        )
    
    # 数据验证：sales_unit 不能为空
    if not task_data.sales_unit or not task_data.sales_unit.strip():
        raise HTTPException(
            status_code=400,
            detail="销售单位不能为空"
        )
    
    # 数据验证：fde_count 必须大于0
    if task_data.fde_count <= 0:
        raise HTTPException(
            status_code=400,
            detail="FDE人数必须大于0"
        )
    
    # 数据验证：end_date 不能早于 start_date
    if task_data.end_date < task_data.start_date:
        raise HTTPException(
            status_code=400,
            detail="结束日期不能早于开始日期"
        )
    
    # 如果是已确认后的修改，只允许修改销售单位和FDE人数
    if is_post_confirmed_update:
        # 修改原因必填
        if not task_data.modify_reason or not task_data.modify_reason.strip():
            raise HTTPException(
                status_code=400,
                detail="已确认后的任务修改必须填写修改原因"
            )

        # 检查是否修改了不允许修改的字段
        if (task.task_name != task_data.task_name or 
            task.start_date != task_data.start_date or 
            task.end_date != task_data.end_date):
            raise HTTPException(
                status_code=400,
                detail="已确认后的任务只能修改销售单位和FDE人数，不能修改任务名称和时间段"
            )
        
        # 检查销售单位变更
        old_sales_units = set([unit.strip() for unit in task.sales_unit.split(',') if unit.strip()])
        new_sales_units = set([unit.strip() for unit in task_data.sales_unit.split(',') if unit.strip()])
        removed_sales_units = old_sales_units - new_sales_units
        
        # 如果有移除的销售单位，检查是否可移除
        # 策略：只检查是否有已派单的工单，如果有工单则不允许移除
        # 如果只有详细需求没有工单，允许移除（历史详细需求会保留，但该销售单位不能再提交新需求）
        if removed_sales_units:
            for removed_unit in removed_sales_units:
                # 查询该销售单位的接口人
                sales_contacts = db.query(User).join(UserRoleAssociation).filter(
                    UserRoleAssociation.role == UserRole.SALES_CONTACT,
                    UserRoleAssociation.approval_status == "approved",
                    UserRoleAssociation.is_active == True,
                    User.is_active == True,
                    User.sales_unit == removed_unit
                ).all()
                
                if sales_contacts:
                    sales_contact_ids = [sc.id for sc in sales_contacts]
                    # 检查是否有这些接口人提交的详细需求
                    detail_requirements = db.query(TaskDetailRequirement).filter(
                        TaskDetailRequirement.task_id == task.id,
                        TaskDetailRequirement.sales_contact_id.in_(sales_contact_ids)
                    ).all()
                    
                    if detail_requirements:
                        # 只检查是否有已派单的工单（不包括已取消的）
                        detail_req_ids = [dr.id for dr in detail_requirements]
                        work_orders = db.query(WorkOrder).filter(
                            WorkOrder.task_id == task.id,
                            WorkOrder.detail_requirement_id.in_(detail_req_ids),
                            WorkOrder.status != WorkOrderStatus.CANCELLED.value
                        ).all()
                        
                        if work_orders:
                            raise HTTPException(
                                status_code=400,
                                detail=f"销售单位「{removed_unit}」已有工单派单，无法移除。请先处理相关工单。"
                            )
                        # 如果只有详细需求没有工单，允许移除（不抛出异常）
                        # 移除后，该销售单位将无法再提交新的详细需求，但已提交的详细需求会保留
        
        # 检查FDE人数变更
        if task_data.fde_count < task.fde_count:
            # 统计已派单的工单数量（不包括已取消的）
            dispatched_work_order_count = db.query(WorkOrder).filter(
                WorkOrder.task_id == task.id,
                WorkOrder.status != WorkOrderStatus.CANCELLED.value
            ).count()
            
            if task_data.fde_count < dispatched_work_order_count:
                raise HTTPException(
                    status_code=400,
                    detail=f"FDE人数不能少于已派单工单数量（当前已派单：{dispatched_work_order_count}个）"
                )
    
    # 如果是销售单位接口人更新草稿任务，验证销售单位匹配
    if current_role.role == UserRole.SALES_CONTACT:
        user_sales_unit = current_role.sales_unit or current_user.sales_unit
        if user_sales_unit:
            task_sales_units = [unit.strip() for unit in task_data.sales_unit.split(',') if unit.strip()]
            sales_unit_matched = False
            for unit in task_sales_units:
                if user_sales_unit == unit:
                    sales_unit_matched = True
                    break
                if user_sales_unit in unit or unit in user_sales_unit:
                    sales_unit_matched = True
                    break
            
            if not sales_unit_matched:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"您只能修改属于您销售单位（{user_sales_unit}）的任务。任务的销售单位必须包含您的销售单位。"
                )
    
    # 记录原始状态和字段值，用于判断是否需要状态回退以及审计日志
    original_status = task.status
    original_data = {
        "task_name": task.task_name,
        "sales_unit": task.sales_unit,
        "start_date": task.start_date,
        "end_date": task.end_date,
        "fde_count": task.fde_count,
    }

    # 更新任务字段（统一使用传入值，草稿和已确认后的修改共用）
    task.task_name = task_data.task_name
    task.sales_unit = task_data.sales_unit
    task.start_date = task_data.start_date
    task.end_date = task_data.end_date
    task.fde_count = task_data.fde_count
    
    # 如果是已确认后的修改，回退状态到待确认，并清空确认时间
    if is_post_confirmed_update:
        task.status = TaskStatus.PENDING
        # 保留首次确认时间，不清空 confirmed_at（如果需要记录首次确认时间）
        # task.confirmed_at = None  # 如果需要清空，取消注释
    
    db.commit()
    db.refresh(task)

    # 计算字段变更详情（用于审计日志）
    new_data = {
        "task_name": task.task_name,
        "sales_unit": task.sales_unit,
        "start_date": task.start_date,
        "end_date": task.end_date,
        "fde_count": task.fde_count,
    }
    changed_fields = {}
    for field, old_value in original_data.items():
        new_value = new_data.get(field)
        if old_value != new_value:
            changed_fields[field] = {
                "old": str(old_value) if old_value is not None else None,
                "new": str(new_value) if new_value is not None else None,
            }
    
    # 如果是已确认后的修改，发送通知给总管要求重新审批
    if is_post_confirmed_update and original_status != TaskStatus.PENDING:
        try:
            notify_task_pending(db, task)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to send task pending notification after update: {str(e)}")
    
    # 记录操作日志
    initiator_type = "销售单位接口人" if current_role.role == UserRole.SALES_CONTACT else "专项任务发起人"
    log_description = f"更新任务：{task.task_name}（发起人类型：{initiator_type}）"
    if is_post_confirmed_update:
        log_description += "，修改后需重新审批"
    
    # 构造审计详情
    log_details = None
    if changed_fields:
        log_details = {
            "changed_fields": changed_fields
        }
        if is_post_confirmed_update and task_data.modify_reason:
            log_details["modify_reason"] = task_data.modify_reason.strip()

    try:
        log_task_action(
            db=db,
            user_id=current_user.id,
            action=AuditAction.UPDATE,
            task_id=task.id,
            description=log_description,
            details=log_details,
            request=request
        )
        db.commit()
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to log task update action: {str(e)}")
        db.rollback()
    
    return task


@router.post("/{task_id}/submit", response_model=TaskResponse)
def submit_task(
    task_id: int,
    request: Request,
    user_role: tuple = Depends(require_role(UserRole.TASK_INITIATOR, UserRole.SALES_CONTACT)),
    db: Session = Depends(get_db)
):
    """
    发起任务（将草稿状态改为待确认，发送通知给总管）
    """
    current_user, current_role = user_role
    
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    # 只有创建者可以发起任务
    if task.initiator_id != current_user.id:
        raise HTTPException(status_code=403, detail="只有创建者可以发起任务")
    
    # 只有草稿状态的任务可以发起
    if task.status != TaskStatus.DRAFT:
        raise HTTPException(status_code=400, detail="只有草稿状态的任务可以发起")
    
    # 将状态改为待确认
    task.status = TaskStatus.PENDING
    db.commit()
    db.refresh(task)
    
    # 发送通知给所有总管（通知失败不影响主业务）
    try:
        notify_task_pending(db, task)
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to send task pending notification: {str(e)}")
    
    # 记录操作日志
    initiator_type = "销售单位接口人" if current_role.role == UserRole.SALES_CONTACT else "专项任务发起人"
    try:
        log_task_action(
            db=db,
            user_id=current_user.id,
            action=AuditAction.UPDATE,
            task_id=task.id,
            description=f"发起任务：{task.task_name}（发起人类型：{initiator_type}）",
            request=request
        )
        db.commit()
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to log task submit action: {str(e)}")
        db.rollback()
    
    return task


@router.post("/{task_id}/revoke", response_model=TaskResponse)
def revoke_task_by_initiator(
    task_id: int,
    request: Request,
    user_role: tuple = Depends(require_role(UserRole.TASK_INITIATOR, UserRole.SALES_CONTACT)),
    db: Session = Depends(get_db)
):
    """
    撤回任务（创建者撤回已发起的任务）
    允许撤回的状态：
    - PENDING（待确认）：总管还没审批
    - CONFIRMED（已确认）：总管已确认，但还没有派单（审批完成前）
    """
    current_user, current_role = user_role
    
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    # 只有创建者可以撤回任务
    if task.initiator_id != current_user.id:
        raise HTTPException(status_code=403, detail="只有创建者可以撤回任务")
    
    try:
        # 调用工作流函数撤回任务
        task = revoke_task(db, task)
        
        # 自动标记相关通知为已读
        try:
            mark_notifications_as_read_by_resource(
                db=db,
                user_id=current_user.id,
                resource_type="task",
                resource_id=task.id,
                notification_types=[NotificationType.TASK_PENDING, NotificationType.TASK_CONFIRMED]
            )
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to mark notifications as read: {str(e)}")
        
        # 提交事务
        db.commit()
        db.refresh(task)
        
        # 发送通知给总管（通知失败不影响主业务）
        try:
            notify_task_revoked(db, task)
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to send task revoked notification: {str(e)}")
        
        # 记录操作日志
        initiator_type = "销售单位接口人" if current_role.role == UserRole.SALES_CONTACT else "专项任务发起人"
        try:
            log_task_action(
                db=db,
                user_id=current_user.id,
                action=AuditAction.UPDATE,
                task_id=task.id,
                description=f"撤回任务：{task.task_name}（发起人类型：{initiator_type}）",
                request=request
            )
            db.commit()
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to log task revoke action: {str(e)}")
            db.rollback()
        
        return task
    except WorkflowError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"撤回任务失败：{str(e)}")


@router.get("", response_model=PaginatedResponse[TaskResponse])
def get_tasks(
    status_filter: Optional[TaskStatus] = None,
    task_name: Optional[str] = Query(None, description="按任务名称模糊搜索"),
    sales_unit: Optional[str] = Query(None, description="按销售单位模糊搜索"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(10, ge=1, le=100, description="每页数量"),
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """获取任务列表（根据当前激活角色权限过滤，支持分页和搜索）"""
    current_user, current_role = user_role
    
    query = db.query(Task)
    
    # 根据当前激活的角色过滤（数据权限基于当前角色）
    if current_role.role == UserRole.TASK_INITIATOR:
        query = query.filter(Task.initiator_id == current_user.id)
    elif current_role.role == UserRole.SALES_CONTACT:
        # 销售单位接口人可以查看销售单位匹配的任务
        # 使用当前角色的sales_unit
        user_sales_unit = current_role.sales_unit or current_user.sales_unit
        if user_sales_unit:
            # 支持双向匹配：
            # 1. 任务的sales_unit包含用户的sales_unit（例如：任务="理想公司,其他"，用户="理想公司"）
            # 2. 用户的sales_unit包含任务的sales_unit（例如：任务="理想公司"，用户="销售单位-理想公司"）
            # 3. 任务的sales_unit包含"全部"时，所有销售单位接口人都能看到
            # 任务的sales_unit可能是多个值用逗号分隔，需要拆分后逐个匹配
            
            # 为了支持双向匹配，我们需要在应用层进行精确匹配
            # 但为了性能，先用SQL进行宽松的初步过滤
            from sqlalchemy import or_
            user_sales_unit = current_user.sales_unit
            
            # SQL初步过滤：匹配所有可能的情况（宽松匹配）
            # 由于需要支持双向匹配（任务="理想公司"匹配用户="销售单位-理想公司"），
            # SQL的LIKE无法完全支持反向匹配，所以我们使用更宽松的过滤策略：
            # 1. 任务的sales_unit包含用户的sales_unit（例如：任务="理想公司,其他"，用户="理想公司"）
            # 2. 任务的sales_unit等于用户的sales_unit
            # 3. 任务的sales_unit包含"全部"（特殊处理）
            # 4. 对于反向匹配，我们需要在应用层处理
            
            # 为了确保不遗漏反向匹配的情况，我们使用一个更宽松的策略：
            # 如果用户的sales_unit包含常见的前缀（如"销售单位-"），尝试提取关键部分
            # 但为了简单和准确，我们直接获取所有任务，然后在应用层进行精确匹配
            # 如果任务数量很大，可以考虑优化SQL过滤条件
            
            # 暂时获取所有任务，在应用层进行精确匹配
            # 如果性能有问题，可以优化SQL过滤条件
            all_tasks_query = db.query(Task)
            
            # 获取所有任务，然后在应用层进行精确匹配
            all_tasks = all_tasks_query.all()
            
            # 在应用层进行精确匹配：检查任务的sales_unit中的每个值是否匹配用户的sales_unit
            matched_tasks = []
            
            for task in all_tasks:
                task_sales_units = [unit.strip() for unit in task.sales_unit.split(',') if unit.strip()]
                matched = False
                
                # 特殊处理：如果任务的sales_unit包含"全部"，所有销售单位接口人都能看到
                if "全部" in task_sales_units:
                    matched = True
                else:
                    # 否则，检查是否匹配用户的销售单位
                    for unit in task_sales_units:
                        # 精确匹配
                        if unit == user_sales_unit:
                            matched = True
                            break
                        # 包含匹配：任务的sales_unit包含用户的sales_unit（例如：任务="理想公司,其他"，用户="理想公司"）
                        if user_sales_unit in unit:
                            matched = True
                            break
                        # 包含匹配：用户的sales_unit包含任务的sales_unit（例如：任务="理想公司"，用户="销售单位-理想公司"）
                        if unit in user_sales_unit:
                            matched = True
                            break
                
                if matched:
                    matched_tasks.append(task)
            
            # 使用匹配的任务ID列表重新构建查询
            if matched_tasks:
                task_ids = [task.id for task in matched_tasks]
                query = db.query(Task).filter(Task.id.in_(task_ids))
            else:
                # 如果没有匹配的任务，返回空结果
                query = db.query(Task).filter(Task.id == -1)  # 永远不会匹配的条件
        else:
            # 如果没有设置销售单位，使用旧的逻辑（兼容性）
            query = query.filter(Task.sales_contact_id == current_user.id)
    elif current_role.role == UserRole.TEAM_LEADER:
        # 组长（含联席）看到本组任一组长名下工单对应的任务
        from app.models.work_order import WorkOrder

        peer_ids = get_peer_team_leader_ids(db, current_user.id)
        work_orders = db.query(WorkOrder).filter(WorkOrder.team_leader_id.in_(peer_ids)).all()
        task_ids = [wo.task_id for wo in work_orders]
        query = query.filter(Task.id.in_(task_ids))
    elif current_role.role == UserRole.MEMBER:
        # 成员只能看到分配给自己的工单对应的任务
        from app.models.work_order import WorkOrder
        work_orders = db.query(WorkOrder).filter(WorkOrder.member_id == current_user.id).all()
        task_ids = [wo.task_id for wo in work_orders]
        query = query.filter(Task.id.in_(task_ids))
    elif current_role.role == UserRole.MANAGER:
        # 总管可以看到所有任务，但不包括草稿状态的任务（草稿状态只有创建者可见）
        query = query.filter(Task.status != TaskStatus.DRAFT)
    
    # 状态筛选（如果用户明确选择了状态筛选，则应用筛选）
    # 注意：总管永远看不到草稿状态的任务，即使选择了草稿状态筛选也会被上面的过滤条件排除
    if status_filter:
        if status_filter == TaskStatus.DETAIL_REQUIRED:
            # "未填写详细需求"：任务状态为"已确认"且没有详细需求
            # 先查询所有状态为"已确认"的任务
            query = query.filter(Task.status == TaskStatus.CONFIRMED)
            # 然后排除有详细需求的任务
            # 使用子查询：查找所有有详细需求的任务ID
            from sqlalchemy import exists
            # 查询没有详细需求的任务（使用NOT EXISTS）
            # TaskDetailRequirement 已在文件开头导入
            query = query.filter(
                ~exists().where(TaskDetailRequirement.task_id == Task.id)
            )
        else:
            query = query.filter(Task.status == status_filter)
    
    # 搜索功能（任务名称与销售单位分开筛选，同时填写时为 AND）
    if task_name:
        query = query.filter(Task.task_name.like(f"%{task_name}%"))
    if sales_unit:
        query = query.filter(Task.sales_unit.like(f"%{sales_unit}%"))
    
    # 获取总数
    total = query.count()
    
    # 分页
    pagination = PaginationParams(page=page, page_size=page_size)
    tasks = query.order_by(Task.created_at.desc()).offset(pagination.skip).limit(pagination.limit).all()
    
    return PaginatedResponse.create(tasks, total, page, page_size)


@router.get("/{task_id}", response_model=TaskResponse)
def get_task(
    task_id: int,
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """获取任务详情（基于当前激活角色权限）"""
    current_user, current_role = user_role
    
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    # 使用当前激活角色的权限和sales_unit
    user_sales_unit = current_role.sales_unit or current_user.sales_unit
    if not can_view_task(current_role.role, current_user.id, task, user_sales_unit, db=db):
        raise HTTPException(status_code=403, detail="无权查看此任务")
    
    # 判断任务是否由专项任务发起人创建
    # 直接使用任务创建时记录的角色，而不是查询用户当前角色
    is_task_initiator_created = False
    if task.initiator_role == UserRole.TASK_INITIATOR.value:
        is_task_initiator_created = True
    # 兼容旧数据：如果initiator_role为空，则通过查询用户角色来判断
    elif not task.initiator_role:
        initiator = db.query(User).filter(User.id == task.initiator_id).first()
        if initiator:
            # 检查发起人是否有task_initiator角色（从UserRoleAssociation表查询）
            initiator_role = db.query(UserRoleAssociation).filter(
                UserRoleAssociation.user_id == initiator.id,
                UserRoleAssociation.role == UserRole.TASK_INITIATOR,
                UserRoleAssociation.is_active == True
            ).first()
            if initiator_role:
                is_task_initiator_created = True
    
    # 创建一个包含is_task_initiator_created字段的字典
    task_dict = {
        **task.__dict__,
        'is_task_initiator_created': is_task_initiator_created
    }
    
    # 使用TaskResponse创建响应对象
    return TaskResponse(**task_dict)


@router.post("/{task_id}/confirm", response_model=TaskResponse)
def confirm_or_reject_task(
    task_id: int,
    confirm_data: TaskConfirm,
    request: Request,
    user_role: tuple = Depends(require_role(UserRole.MANAGER)),
    db: Session = Depends(get_db)
):
    """确认或拒绝任务（总管）"""
    current_user, current_role = user_role
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    try:
        if confirm_data.confirmed:
            # 确认任务时，根据任务的销售单位自动找到所有匹配的销售单位接口人
            # 任务的sales_unit可能是多个，用逗号分隔
            task_sales_units = [unit.strip() for unit in task.sales_unit.split(',') if unit.strip()]
            
            if not task_sales_units:
                raise HTTPException(status_code=400, detail="任务未指定销售单位")
            
            # 查找所有匹配的销售单位接口人
            # 现在用户可以有多个角色，需要从UserRoleAssociation表中查询
            from sqlalchemy import or_
            
            # 检查是否包含"全部"：如果任务的销售单位包含"全部"，则匹配所有销售单位接口人
            is_all_units = "全部" in task_sales_units
            
            if is_all_units:
                # 如果销售单位是"全部"，查询所有已审核通过、活跃的销售单位接口人
                sales_contact_roles = db.query(UserRoleAssociation).join(User).filter(
                    UserRoleAssociation.role == UserRole.SALES_CONTACT,
                    UserRoleAssociation.approval_status == "approved",
                    UserRoleAssociation.is_active == True,
                    User.is_active == True
                ).all()
                
                # 获取对应的用户ID列表（去重）
                contact_user_ids = list(set([role.user_id for role in sales_contact_roles]))
                
                if not contact_user_ids:
                    # 获取所有销售单位接口人用于调试
                    all_contact_roles = db.query(UserRoleAssociation).join(User).filter(
                        UserRoleAssociation.role == UserRole.SALES_CONTACT,
                        UserRoleAssociation.approval_status == "approved",
                        UserRoleAssociation.is_active == True,
                        User.is_active == True
                    ).all()
                    available_units = [role.sales_unit for role in all_contact_roles if role.sales_unit]
                    error_msg = f"任务的销售单位为'全部'，但系统中没有任何已审核通过、活跃的销售单位接口人。系统中存在的销售单位接口人的销售单位：{', '.join(set(available_units)) if available_units else '无'}"
                    raise HTTPException(status_code=400, detail=error_msg)
            else:
                # 当选择具体销售单位时，必须所有销售单位都有匹配的接口人
                # 逐个检查每个销售单位是否有匹配的接口人
                all_sales_contact_roles = []  # 所有匹配的接口人角色
                
                # 获取系统中所有已审核通过、活跃的销售单位接口人（用于匹配检查）
                all_contact_roles = db.query(UserRoleAssociation).join(User).filter(
                    UserRoleAssociation.role == UserRole.SALES_CONTACT,
                    UserRoleAssociation.approval_status == "approved",
                    UserRoleAssociation.is_active == True,
                    User.is_active == True
                ).all()
                
                # 为每个任务的销售单位检查是否有匹配的接口人
                for unit in task_sales_units:
                    unit_matched = False
                    matched_roles_for_unit = []
                    
                    # 检查该销售单位是否有匹配的接口人
                    for role in all_contact_roles:
                        if not role.sales_unit:
                            continue
                        
                        # 精确匹配
                        if role.sales_unit == unit:
                            unit_matched = True
                            matched_roles_for_unit.append(role)
                            continue
                        
                        # 包含匹配：销售单位接口人的sales_unit包含任务的sales_unit
                        # 例如：任务的"宝山"可以匹配用户的"销售单位-宝山"
                        if unit in role.sales_unit:
                            unit_matched = True
                            matched_roles_for_unit.append(role)
                            continue
                        
                        # 反向匹配：销售单位接口人的sales_unit被任务的sales_unit包含
                        # 例如：任务的"销售单位-宝山"可以匹配用户的"宝山"
                        if role.sales_unit in unit:
                            unit_matched = True
                            matched_roles_for_unit.append(role)
                            continue
                        
                        # 如果任务的sales_unit包含"销售单位-"前缀，也尝试匹配去掉前缀后的值
                        if unit.startswith("销售单位-"):
                            unit_without_prefix = unit.replace("销售单位-", "")
                            if role.sales_unit == unit_without_prefix or unit_without_prefix in role.sales_unit or role.sales_unit in unit_without_prefix:
                                unit_matched = True
                                matched_roles_for_unit.append(role)
                                continue
                    
                    if not unit_matched:
                        # 如果有未匹配的销售单位，使用简单的错误提示（类似老版本）
                        available_units = [r.sales_unit for r in all_contact_roles if r.sales_unit]
                        error_msg = f"未找到匹配的销售单位接口人。任务的销售单位：{task.sales_unit}。系统中存在的销售单位接口人的销售单位：{', '.join(set(available_units)) if available_units else '无'}"
                        raise HTTPException(status_code=400, detail=error_msg)
                    
                    # 如果匹配，添加到总列表
                    all_sales_contact_roles.extend(matched_roles_for_unit)
                
                # 所有销售单位都匹配成功，获取对应的用户ID列表（去重）
                contact_user_ids = list(set([role.user_id for role in all_sales_contact_roles]))
            
            # 安全检查：确保有匹配的接口人
            if not contact_user_ids:
                # 获取所有销售单位接口人用于调试
                all_contact_roles = db.query(UserRoleAssociation).join(User).filter(
                    UserRoleAssociation.role == UserRole.SALES_CONTACT,
                    UserRoleAssociation.approval_status == "approved",
                    UserRoleAssociation.is_active == True,
                    User.is_active == True
                ).all()
                available_units = [role.sales_unit for role in all_contact_roles if role.sales_unit]
                if is_all_units:
                    error_msg = f"任务的销售单位为'全部'，但系统中没有任何已审核通过、活跃的销售单位接口人。系统中存在的销售单位接口人的销售单位：{', '.join(set(available_units)) if available_units else '无'}"
                else:
                    error_msg = f"未找到匹配的销售单位接口人。任务的销售单位：{task.sales_unit}。系统中存在的销售单位接口人的销售单位：{', '.join(set(available_units)) if available_units else '无'}"
                raise HTTPException(status_code=400, detail=error_msg)
            
            # 获取用户对象
            sales_contacts = db.query(User).filter(User.id.in_(contact_user_ids)).all()
            
            # 确认任务（不再需要指定单个sales_contact_id）
            task = confirm_task(db, task, current_user.id)
            
            # 自动标记相关通知为已读（用户通过待办列表处理事项时，通知应自动标记为已读）
            try:
                mark_notifications_as_read_by_resource(
                    db=db,
                    user_id=current_user.id,
                    resource_type="task",
                    resource_id=task.id,
                    notification_types=[NotificationType.TASK_PENDING]
                )
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Failed to mark notifications as read: {str(e)}")
            
            # 发送通知给所有匹配的销售单位接口人（通知失败不影响主业务）
            try:
                notify_task_confirmed(db, task, [contact.id for contact in sales_contacts])
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Failed to send task confirmed notification: {str(e)}")
            
            # 记录操作日志
            log_task_action(
                db=db,
                user_id=current_user.id,
                action=AuditAction.CONFIRM,
                task_id=task.id,
                description=f"确认任务：{task.task_name}，已自动派发给 {len(sales_contacts)} 个销售单位接口人",
                request=request
            )
            
            # 统一提交事务
            db.commit()
            db.refresh(task)
        else:
            task = reject_task(db, task, current_user.id, confirm_data.rejection_reason or "")
            
            # 自动标记相关通知为已读（用户通过待办列表处理事项时，通知应自动标记为已读）
            try:
                mark_notifications_as_read_by_resource(
                    db=db,
                    user_id=current_user.id,
                    resource_type="task",
                    resource_id=task.id,
                    notification_types=[NotificationType.TASK_PENDING]
                )
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Failed to mark notifications as read: {str(e)}")
            
            # 发送通知（通知失败不影响主业务）
            try:
                notify_task_rejected(db, task)
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Failed to send task rejected notification: {str(e)}")
            # 记录操作日志
            log_task_action(
                db=db,
                user_id=current_user.id,
                action=AuditAction.REJECT,
                task_id=task.id,
                description=f"拒绝任务：{task.task_name}",
                details={"rejection_reason": confirm_data.rejection_reason},
                request=request
            )
            
            # 统一提交事务
            db.commit()
            db.refresh(task)
        return task
    except HTTPException:
        # 重新抛出HTTPException，不需要rollback（因为HTTPException是预期的错误）
        raise
    except WorkflowError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        # 记录详细错误信息到日志
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"任务确认失败: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"操作失败：{str(e)}")


@router.post("/{task_id}/close", response_model=TaskResponse)
def close_task_by_manager(
    task_id: int,
    close_data: TaskClose,
    request: Request,
    user_role: tuple = Depends(require_role(UserRole.MANAGER)),
    db: Session = Depends(get_db)
):
    """关闭任务（总管）"""
    current_user, current_role = user_role
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    try:
        task = close_task(db, task, current_user.id, close_data.close_reason)
        
        # 记录操作日志
        log_task_action(
            db=db,
            user_id=current_user.id,
            action=AuditAction.UPDATE,
            task_id=task.id,
            description=f"关闭任务：{task.task_name}",
            details={"close_reason": close_data.close_reason},
            request=request
        )
        
        # 统一提交事务
        db.commit()
        db.refresh(task)
        
        return task
    except WorkflowError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"关闭任务失败：{str(e)}")


@router.put("/{task_id}/detail", response_model=TaskResponse)
def submit_detail(
    task_id: int,
    detail_data: TaskDetailUpdate,
    request: Request,
    user_role: tuple = Depends(require_role(UserRole.SALES_CONTACT)),
    db: Session = Depends(get_db)
):
    """提交详细需求单（销售单位接口人）- 基于当前激活角色"""
    current_user, current_role = user_role
    
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    # 仅已关闭任务不可提交；已完成任务可继续提交（多阶段需求）
    if task.status == TaskStatus.CANCELLED:
        raise HTTPException(status_code=400, detail="任务已关闭，无法提交详细需求")

    # 使用当前激活角色的sales_unit进行验证
    user_sales_unit = current_role.sales_unit or current_user.sales_unit
    if user_sales_unit:
        task_sales_units = [unit.strip() for unit in task.sales_unit.split(',') if unit.strip()]
        # 特殊处理：如果任务的sales_unit包含"全部"，所有销售单位接口人都能提交
        if "全部" not in task_sales_units:
            # 支持精确匹配和包含匹配
            sales_unit_matched = False
            for unit in task_sales_units:
                # 精确匹配
                if user_sales_unit == unit:
                    sales_unit_matched = True
                    break
                # 包含匹配：任务的销售单位包含用户的销售单位，或用户的销售单位包含任务的销售单位
                if user_sales_unit in unit or unit in user_sales_unit:
                    sales_unit_matched = True
                    break
            if not sales_unit_matched:
                raise HTTPException(
                    status_code=403, 
                    detail=f"您的销售单位（{user_sales_unit}）与任务的销售单位不匹配，无权提交此任务的详细需求单"
                )
    else:
        # 兼容旧逻辑：如果没有设置销售单位，检查task.sales_contact_id
        if task.sales_contact_id and task.sales_contact_id != current_user.id:
            raise HTTPException(status_code=403, detail="无权提交此任务的详细需求单")

    user_sales_unit_str = (user_sales_unit or "").strip()
    # 非云能力中心销售单位接口人：客户来源固定为本人销售单位，不允许自选
    if sales_contact_can_choose_customer_source(user_sales_unit_str or None):
        if not detail_data.customer_source or not detail_data.customer_source.strip():
            raise HTTPException(status_code=400, detail="客户来源为必填项")
    else:
        if not user_sales_unit_str:
            raise HTTPException(
                status_code=400,
                detail="当前账号未配置销售单位，无法确定客户来源，请联系管理员",
            )
        detail_data = detail_data.model_copy(update={"customer_source": user_sales_unit_str})

    # 统一规则：所有任务提交详细需求时，客户三字段均为必填
    if not detail_data.customer_visit_address:
        raise HTTPException(status_code=400, detail="客户拜访地址为必填项")
    if not detail_data.customer_manager_name:
        raise HTTPException(status_code=400, detail="客户经理姓名为必填项")
    if not detail_data.customer_manager_contact:
        raise HTTPException(status_code=400, detail="客户经理联系方式为必填项")
    
    try:
        # 创建详细需求记录（支持一个任务多个客户）
        detail_req = TaskDetailRequirement(
            task_id=task.id,
            customer_unit=detail_data.customer_unit,
            industry_type=detail_data.industry_type,
            customer_source=detail_data.customer_source,
            requirement_content=detail_data.requirement_content,
            expected_visit_time=detail_data.expected_visit_time,
            customer_visit_address=detail_data.customer_visit_address,
            customer_manager_name=detail_data.customer_manager_name,
            customer_manager_contact=detail_data.customer_manager_contact,
            sales_contact_id=current_user.id
        )
        db.add(detail_req)
        db.flush()
        
        # 调用工作流函数（只记录首次提交时间，不改变任务状态）
        task = submit_detail_requirement(db, task, current_user.id)
        
        # 自动标记相关通知为已读（用户通过待办列表处理事项时，通知应自动标记为已读）
        try:
            mark_notifications_as_read_by_resource(
                db=db,
                user_id=current_user.id,
                resource_type="task",
                resource_id=task.id,
                notification_types=[NotificationType.TASK_CONFIRMED]
            )
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to mark notifications as read: {str(e)}")
        
        db.commit()
        db.refresh(detail_req)

        auto_dispatch_ok = False
        auto_dispatch_reason = "not_attempted"
        try:
            auto_dispatch_ok, auto_dispatch_reason = _try_auto_dispatch_detail_requirement(
                db=db,
                task=task,
                detail_requirement=detail_req,
                operator_user_id=current_user.id,
                request=request,
            )
        except Exception as e:
            auto_dispatch_ok = False
            auto_dispatch_reason = f"auto_dispatch_error:{str(e)}"

        # 仅在未自动派单时通知总管有新的详细需求待处理
        if not auto_dispatch_ok:
            try:
                notify_task_detail_submitted(db, task)
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Failed to send task detail submitted notification: {str(e)}")

        # 记录操作日志（含自动派单结果）
        submit_desc = f"提交详细需求单：{task.task_name}，客户：{detail_data.customer_unit}"
        if auto_dispatch_ok:
            submit_desc += "（已自动派单）"
        elif auto_dispatch_reason != "not_attempted":
            submit_desc += "（未自动派单，待总管处理）"
        log_task_action(
            db=db,
            user_id=current_user.id,
            action=AuditAction.SUBMIT,
            task_id=task.id,
            description=submit_desc,
            details={
                "detail_requirement_id": detail_req.id,
                "customer_source": detail_req.customer_source,
                "auto_dispatch_success": auto_dispatch_ok,
                "auto_dispatch_reason": auto_dispatch_reason,
            },
            request=request
        )
        db.commit()
        db.refresh(task)
        
        return task
    except WorkflowError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"提交失败：{str(e)}")


@router.get("/{task_id}/detail-requirements/template")
def download_detail_requirement_template(
    task_id: int,
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """下载详细需求单 Excel 模板（基于当前激活角色权限）"""
    current_user, current_role = user_role
    
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    user_sales_unit = current_role.sales_unit or current_user.sales_unit
    if not can_view_task(current_role.role, current_user.id, task, user_sales_unit, db=db):
        raise HTTPException(status_code=403, detail="无权下载此任务的模板")
    
    # 生成统一模板：所有任务的详细需求均要求客户三字段必填
    excel_file = generate_detail_requirement_template()
    
    # 处理文件名编码（支持中文）
    filename = f"详细需求单模板_{task.task_name}.xlsx"
    # 使用 RFC 5987 格式编码文件名
    encoded_filename = quote(filename, safe='')
    content_disposition = f"attachment; filename*=UTF-8''{encoded_filename}"
    
    return StreamingResponse(
        excel_file,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": content_disposition
        }
    )


@router.post("/{task_id}/detail-requirements/batch-import", response_model=BatchImportResponse)
def batch_import_detail_requirements(
    task_id: int,
    file: UploadFile = File(...),
    request: Request = None,
    user_role: tuple = Depends(require_role(UserRole.SALES_CONTACT)),
    db: Session = Depends(get_db)
):
    """批量导入详细需求单（销售单位接口人）- 基于当前激活角色"""
    current_user, current_role = user_role
    
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    # 仅已关闭任务不可提交；已完成任务可继续提交（多阶段需求）
    if task.status == TaskStatus.CANCELLED:
        raise HTTPException(status_code=400, detail="任务已关闭，无法提交详细需求")

    # 使用当前激活角色的sales_unit进行验证
    user_sales_unit = current_role.sales_unit or current_user.sales_unit
    if user_sales_unit:
        task_sales_units = [unit.strip() for unit in task.sales_unit.split(',') if unit.strip()]
        # 特殊处理：如果任务的sales_unit包含"全部"，所有销售单位接口人都能提交
        if "全部" not in task_sales_units:
            sales_unit_matched = False
            for unit in task_sales_units:
                if user_sales_unit == unit:
                    sales_unit_matched = True
                    break
                if user_sales_unit in unit or unit in user_sales_unit:
                    sales_unit_matched = True
                    break
            if not sales_unit_matched:
                raise HTTPException(
                    status_code=403,
                    detail=f"您的销售单位（{user_sales_unit}）与任务的销售单位不匹配，无权提交此任务的详细需求单"
                )
    else:
        if task.sales_contact_id and task.sales_contact_id != current_user.id:
            raise HTTPException(status_code=403, detail="无权提交此任务的详细需求单")
    
    # 验证文件类型
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="文件格式不正确，请上传 Excel 文件（.xlsx 或 .xls）")

    user_sales_unit_str = (user_sales_unit or "").strip()
    allow_missing_customer_source = not sales_contact_can_choose_customer_source(user_sales_unit_str or None)

    try:
        # 读取文件内容
        file_content = file.file.read()
        
        # 解析 Excel 文件（统一要求客户三字段）
        requirements_data = parse_detail_requirement_excel(
            file_content,
            allow_missing_customer_source=allow_missing_customer_source,
        )
        
        # 批量创建详细需求
        imported_requirements = []
        errors = []
        success_count = 0
        failed_count = 0
        
        for req_data in requirements_data:
            try:
                # 统一规则：所有任务导入详细需求时，客户三字段均为必填
                if not req_data.get("customer_visit_address"):
                    raise ValueError("客户拜访地址为必填项")
                if not req_data.get("customer_manager_name"):
                    raise ValueError("客户经理姓名为必填项")
                if not req_data.get("customer_manager_contact"):
                    raise ValueError("客户经理联系方式为必填项")

                if not sales_contact_can_choose_customer_source(user_sales_unit_str or None):
                    if not user_sales_unit_str:
                        raise ValueError("当前账号未配置销售单位，无法确定客户来源")
                    req_data = {**req_data, "customer_source": user_sales_unit_str}

                detail_req = TaskDetailRequirement(
                    task_id=task.id,
                    customer_unit=req_data["customer_unit"],
                    industry_type=req_data["industry_type"],
                    customer_source=req_data.get("customer_source"),
                    requirement_content=req_data["requirement_content"],
                    expected_visit_time=req_data.get("expected_visit_time"),
                    customer_visit_address=req_data.get("customer_visit_address"),
                    customer_manager_name=req_data.get("customer_manager_name"),
                    customer_manager_contact=req_data.get("customer_manager_contact"),
                    sales_contact_id=current_user.id
                )
                db.add(detail_req)
                db.flush()  # 获取 ID
                imported_requirements.append(detail_req)
                success_count += 1
            except Exception as e:
                failed_count += 1
                errors.append(f"第{req_data.get('row_number', '?')}行：{str(e)}")
        
        # 如果有成功导入的记录，记录首次提交时间（不改变任务状态）
        auto_dispatch_success_count = 0
        auto_dispatch_failed_count = 0
        auto_dispatch_results: list[dict] = []
        if success_count > 0:
            task = submit_detail_requirement(db, task, current_user.id)
            
            # 自动标记相关通知为已读（用户通过待办列表处理事项时，通知应自动标记为已读）
            try:
                mark_notifications_as_read_by_resource(
                    db=db,
                    user_id=current_user.id,
                    resource_type="task",
                    resource_id=task.id,
                    notification_types=[NotificationType.TASK_CONFIRMED]
                )
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Failed to mark notifications as read: {str(e)}")
            
            # 先提交导入结果，确保详细需求落库
            db.commit()

            # 自动派单尝试（失败不阻断）
            for imported_req in imported_requirements:
                try:
                    ok, reason = _try_auto_dispatch_detail_requirement(
                        db=db,
                        task=task,
                        detail_requirement=imported_req,
                        operator_user_id=current_user.id,
                        request=request,
                    )
                except Exception as e:
                    ok, reason = False, f"auto_dispatch_error:{str(e)}"
                if ok:
                    auto_dispatch_success_count += 1
                else:
                    auto_dispatch_failed_count += 1
                auto_dispatch_results.append({
                    "detail_requirement_id": imported_req.id,
                    "customer_source": imported_req.customer_source,
                    "success": ok,
                    "reason": reason,
                })

            # 仅未自动派单成功的场景通知总管
            if auto_dispatch_failed_count > 0:
                try:
                    notify_task_detail_submitted(db, task)
                except Exception as e:
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.error(f"Failed to send task detail submitted notification: {str(e)}")

            # 记录操作日志（含自动派单结果）
            description = f"批量导入详细需求单：{task.task_name}，成功导入 {success_count} 条"
            if auto_dispatch_success_count > 0:
                description += f"，自动派单成功 {auto_dispatch_success_count} 条"
            if auto_dispatch_failed_count > 0:
                description += f"，待总管手动派单 {auto_dispatch_failed_count} 条"
            log_task_action(
                db=db,
                user_id=current_user.id,
                action=AuditAction.SUBMIT,
                task_id=task.id,
                description=description,
                details={
                    "success_count": success_count,
                    "failed_count": failed_count,
                    "auto_dispatch_success_count": auto_dispatch_success_count,
                    "auto_dispatch_failed_count": auto_dispatch_failed_count,
                    "auto_dispatch_results": auto_dispatch_results[:100],
                },
                request=request
            )
        
        db.commit()
        
        # 刷新导入的记录以获取完整信息
        for req in imported_requirements:
            db.refresh(req)
        
        return BatchImportResponse(
            success_count=success_count,
            failed_count=failed_count,
            errors=errors,
            imported_requirements=[TaskDetailRequirementResponse.model_validate(req) for req in imported_requirements]
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"批量导入失败：{str(e)}")


@router.get("/{task_id}/detail-requirements", response_model=PaginatedResponse[TaskDetailRequirementResponse])
def get_task_detail_requirements(
    task_id: int,
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(10, ge=1, le=100, description="每页数量"),
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """获取任务的详细需求列表（基于当前激活角色权限，支持分页）"""
    current_user, current_role = user_role
    
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    user_sales_unit = current_role.sales_unit or current_user.sales_unit
    if not can_view_task(current_role.role, current_user.id, task, user_sales_unit, db=db):
        raise HTTPException(status_code=403, detail="无权查看此任务的详细需求")
    
    # 查询需求，根据角色进行过滤
    detail_requirements_query = db.query(TaskDetailRequirement).filter(
        TaskDetailRequirement.task_id == task_id
    )
    
    # 销售单位接口人：只能看到自己提交的需求（sales_contact_id匹配且销售单位匹配）
    if current_role.role == UserRole.SALES_CONTACT:
        if user_sales_unit:
            # 先获取所有需求，然后在应用层进行过滤
            all_requirements = detail_requirements_query.all()
            filtered_requirements = []
            
            for req in all_requirements:
                # 检查需求的sales_contact_id是否匹配当前用户
                if req.sales_contact_id == current_user.id:
                    # 进一步检查销售单位是否匹配
                    sales_contact = db.query(User).filter(User.id == req.sales_contact_id).first()
                    if sales_contact:
                        contact_sales_unit = sales_contact.sales_unit
                        # 支持精确匹配和包含匹配
                        if contact_sales_unit == user_sales_unit:
                            filtered_requirements.append(req)
                        elif user_sales_unit in contact_sales_unit or contact_sales_unit in user_sales_unit:
                            filtered_requirements.append(req)
            
            # 对过滤后的需求进行排序
            detail_requirements = sorted(filtered_requirements, key=lambda x: x.created_at, reverse=True)
        else:
            # 兼容旧逻辑：如果没有设置销售单位，只返回当前用户提交的需求
            detail_requirements = detail_requirements_query.filter(
                TaskDetailRequirement.sales_contact_id == current_user.id
            ).order_by(TaskDetailRequirement.created_at.desc()).all()
    elif current_role.role == UserRole.TEAM_LEADER:
        allowed_ids = _detail_requirement_ids_for_team_leader(db, task_id, current_user.id)
        ordered = detail_requirements_query.order_by(TaskDetailRequirement.created_at.desc()).all()
        detail_requirements = [r for r in ordered if r.id in allowed_ids]
    elif current_role.role == UserRole.MEMBER:
        allowed_ids = _detail_requirement_ids_for_member(db, task_id, current_user.id)
        ordered = detail_requirements_query.order_by(TaskDetailRequirement.created_at.desc()).all()
        detail_requirements = [r for r in ordered if r.id in allowed_ids]
    else:
        # 总管、专项任务发起人等：可以看到任务下的所有需求
        detail_requirements = detail_requirements_query.order_by(TaskDetailRequirement.created_at.desc()).all()
    
    # 获取总数（在分页之前）
    total = len(detail_requirements)
    
    # 应用分页
    pagination = PaginationParams(page=page, page_size=page_size)
    paginated_requirements = detail_requirements[pagination.skip:pagination.skip + pagination.limit]
    
    # 查询每个详细需求关联的工单和销售单位接口人信息
    from app.models.work_order import WorkOrder, WorkOrderStatus
    result = []
    for req in paginated_requirements:
        work_order = first_active_work_order_for_detail_requirement(db, req.id)
        
        # 查询销售单位接口人信息
        sales_contact = db.query(User).filter(User.id == req.sales_contact_id).first()
        
        # 确定接单人信息
        # 根据实际业务逻辑：只有成员可以接单，组长不能直接接单
        # 流程：总管派单给组长 → 组长转派给成员 → 成员接单
        # 因此，如果工单已接单，接单人一定是成员（member_id）
        acceptor_id = None
        acceptor_name = None
        if work_order:
            # 如果工单已接单（状态为 ACCEPTED、IN_PROGRESS 或 COMPLETED）
            if work_order.status in [WorkOrderStatus.ACCEPTED.value, WorkOrderStatus.IN_PROGRESS.value, WorkOrderStatus.COMPLETED.value]:
                # 接单人必须是成员（因为只有成员可以接单）
                if work_order.member_id:
                    acceptor_id = work_order.member_id
                    member = db.query(User).filter(User.id == work_order.member_id).first()
                    acceptor_name = member.real_name if member else None
                # 如果member_id不存在但工单已接单，这是异常情况（理论上不应该发生）
                # 但为了数据完整性，不设置接单人
        
        req_dict = {
            "id": req.id,
            "task_id": req.task_id,
            "customer_unit": req.customer_unit,
            "industry_type": req.industry_type,
            "customer_source": req.customer_source,
            "requirement_content": req.requirement_content,
            "expected_visit_time": req.expected_visit_time,
            "customer_visit_address": req.customer_visit_address,
            "customer_manager_name": req.customer_manager_name,
            "customer_manager_contact": req.customer_manager_contact,
            "sales_contact_id": req.sales_contact_id,
            "sales_contact_name": sales_contact.real_name if sales_contact else None,
            "sales_contact_unit": sales_contact.sales_unit if sales_contact else None,
            "created_at": req.created_at,
            "updated_at": req.updated_at,
            "work_order_id": work_order.id if work_order else None,
            "work_order_no": work_order.work_order_no if work_order else None,
            "is_dispatched": work_order is not None,
            "acceptor_id": acceptor_id,
            "acceptor_name": acceptor_name
        }
        result.append(TaskDetailRequirementResponse(**req_dict))
    
    return PaginatedResponse.create(result, total, page, page_size)


@router.delete("/{task_id}/detail-requirements/{requirement_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task_detail_requirement(
    task_id: int,
    requirement_id: int,
    request: Request,
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """
    删除/作废任务详细需求
    - 允许角色：总管、提交该详细需求的销售单位接口人
    - 仅当该详细需求尚未派单（无未取消工单）时允许删除
    """
    from app.models.work_order import WorkOrder, WorkOrderStatus

    current_user, current_role = user_role

    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    requirement = db.query(TaskDetailRequirement).filter(
        TaskDetailRequirement.id == requirement_id,
        TaskDetailRequirement.task_id == task.id
    ).first()
    if not requirement:
        raise HTTPException(status_code=404, detail="详细需求不存在")

    # 权限控制：总管或提交人本人
    if current_role.role == UserRole.MANAGER:
        pass
    elif current_role.role == UserRole.SALES_CONTACT:
        if requirement.sales_contact_id != current_user.id:
            raise HTTPException(status_code=403, detail="只有提交人本人可以删除该详细需求")
    else:
        raise HTTPException(status_code=403, detail="无权删除该详细需求")

    # 任务已关闭或已完成时，仅允许总管删除
    if task.status in (TaskStatus.CANCELLED, TaskStatus.COMPLETED) and current_role.role != UserRole.MANAGER:
        raise HTTPException(status_code=400, detail="任务已关闭或已完成，仅总管可以删除详细需求")

    # 校验是否已有未取消工单关联
    work_orders = db.query(WorkOrder).filter(
        WorkOrder.detail_requirement_id == requirement.id,
        WorkOrder.status != WorkOrderStatus.CANCELLED.value
    ).all()
    if work_orders:
        raise HTTPException(
            status_code=400,
            detail="该详细需求已有工单派单，无法删除。如需调整，请先处理相关工单"
        )

    # 记录日志前保留必要信息
    customer_unit = requirement.customer_unit

    try:
        db.delete(requirement)
        db.flush()

        # 删除详细需求后，检查任务状态是否需要更新
        from app.core.workflow import check_and_update_task_status_after_detail_deletion
        check_and_update_task_status_after_detail_deletion(db, task)

        # 记录操作日志
        try:
            log_task_action(
                db=db,
                user_id=current_user.id,
                action=AuditAction.DELETE,
                task_id=task.id,
                description=f"删除详细需求：{task.task_name}，客户：{customer_unit}",
                details={
                    "detail_requirement_id": requirement_id,
                    "customer_unit": customer_unit,
                },
                request=request,
            )
        except Exception:
            # 审计日志失败不影响主流程
            db.rollback()

        db.commit()
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"删除详细需求失败：{str(e)}")

    return

@router.post("/{task_id}/detail-requirements/{requirement_id}/dispatch")
def dispatch_detail_requirement(
    task_id: int,
    requirement_id: int,
    dispatch_data: DetailRequirementDispatch,
    request: Request,
    user_role: tuple = Depends(require_role(UserRole.MANAGER)),
    db: Session = Depends(get_db)
):
    """针对详细需求派单给组长（总管）"""
    current_user, current_role = user_role
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    # 验证详细需求是否存在且属于该任务
    detail_requirement = db.query(TaskDetailRequirement).filter(
        TaskDetailRequirement.id == requirement_id,
        TaskDetailRequirement.task_id == task_id
    ).first()
    if not detail_requirement:
        raise HTTPException(status_code=404, detail="详细需求不存在或不属于该任务")
    try:
        team_leader_ids = _resolve_group_team_leader_ids_by_any_leader(db, dispatch_data.team_leader_id)
        if not team_leader_ids:
            # 兼容异常数据：如果找不到组，至少按指定组长本人派发
            team_leader_ids = [dispatch_data.team_leader_id]
        return _dispatch_detail_requirement_internal(
            db=db,
            task=task,
            detail_requirement=detail_requirement,
            team_leader_ids=team_leader_ids,
            operator_user_id=current_user.id,
            request=request,
            mark_detail_submitted_read=True,
            is_auto_dispatch=False,
        )
    except HTTPException:
        raise
    except WorkflowError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"派单失败：{str(e)}")


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    task_id: int,
    request: Request,
    user_role: tuple = Depends(require_role(UserRole.TASK_INITIATOR, UserRole.SALES_CONTACT)),
    db: Session = Depends(get_db)
):
    """
    删除任务（仅草稿状态，且创建者可以删除）
    删除前检查是否有关联数据：
    - 详细需求（task_detail_requirements）
    - 工单（work_orders）
    - 线索（leads）
    如果有关联数据，不允许删除
    """
    current_user, current_role = user_role
    
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    # 只有创建者可以删除任务
    if task.initiator_id != current_user.id:
        raise HTTPException(status_code=403, detail="只有创建者可以删除任务")
    
    # 只有草稿状态的任务可以删除
    if task.status != TaskStatus.DRAFT:
        raise HTTPException(status_code=400, detail="只能删除草稿状态的任务")
    
    # 检查是否有关联数据
    from app.models.work_order import WorkOrder
    from app.models.lead import Lead
    
    # 检查详细需求
    detail_requirements_count = db.query(TaskDetailRequirement).filter(
        TaskDetailRequirement.task_id == task_id
    ).count()
    
    if detail_requirements_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"任务存在 {detail_requirements_count} 条详细需求，无法删除。请先删除相关详细需求。"
        )
    
    # 检查工单
    work_orders_count = db.query(WorkOrder).filter(
        WorkOrder.task_id == task_id
    ).count()
    
    if work_orders_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"任务存在 {work_orders_count} 个工单，无法删除。请先删除相关工单。"
        )
    
    # 检查线索
    leads_count = db.query(Lead).filter(
        Lead.task_id == task_id
    ).count()
    
    if leads_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"任务存在 {leads_count} 条线索，无法删除。请先删除相关线索。"
        )
    
    # 记录操作日志
    log_task_action(
        db=db,
        user_id=current_user.id,
        action=AuditAction.DELETE,
        task_id=task.id,
        description=f"删除任务：{task.task_name}",
        details={
            "task_name": task.task_name,
            "sales_unit": task.sales_unit,
            "status": task.status.value
        },
        request=request
    )
    
    # 删除任务
    db.delete(task)
    db.commit()
    
    return None
