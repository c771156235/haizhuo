"""
商机管理 API
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models.user import User, UserRole
from app.models.opportunity import Opportunity, OpportunityStatus, CollaborativeMember
from app.models.lead import Lead
from app.models.work_order import WorkOrder
from app.models.visit_log import VisitLog
from app.models.task import Task, TaskDetailRequirement
from app.schemas.opportunity import (
    OpportunityCreate, OpportunityUpdate, OpportunityResponse,
    CollaborativeMemberCreate, CollaborativeMemberResponse
)
from app.schemas.common import PaginationParams, PaginatedResponse
from app.api.deps import get_current_user, get_current_role, require_role
from app.core.workflow import update_opportunity_status, WorkflowError
from app.core.permissions import can_view_opportunity, can_manage_opportunity
from app.core.audit import log_opportunity_action
from app.models.audit_log import AuditAction
from app.services.notification_service import notify_opportunity_created, notify_opportunity_status_changed, notify_collaborative_member_added
from app.utils.opportunity_query_scope import apply_opportunity_list_role_scope
from app.utils.team_leader_peer_scope import get_peer_team_leader_ids
from fastapi import Request

router = APIRouter(prefix="/opportunities", tags=["商机管理"])


@router.post("", response_model=OpportunityResponse, status_code=status.HTTP_201_CREATED)
def create_opportunity(
    opportunity_data: OpportunityCreate,
    request: Request,
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """创建商机（成员或组长从线索转换）"""
    current_user, current_role = user_role
    
    # 验证角色：只有成员和组长可以创建商机
    if current_role.role not in [UserRole.MEMBER, UserRole.TEAM_LEADER]:
        raise HTTPException(status_code=403, detail="只有成员和组长可以创建商机")
    
    # 验证线索是否存在
    lead = db.query(Lead).options(
        joinedload(Lead.task),
        joinedload(Lead.visit_log).joinedload(VisitLog.work_order)
    ).filter(Lead.id == opportunity_data.lead_id).first()
    
    if not lead:
        raise HTTPException(status_code=404, detail="线索不存在")
    
    # 检查线索是否已经转换为商机
    if lead.opportunity:
        raise HTTPException(status_code=400, detail="该线索已经转换为商机，无法重复转换")
    
    # 权限检查：成员只能转换自己创建的线索，组长可以转换团队成员的线索
    if current_role.role == UserRole.MEMBER:
        if lead.member_id != current_user.id:
            raise HTTPException(status_code=403, detail="只能转换自己创建的线索")
        # 成员创建商机时，team_leader_id应该是其所属工单的组长
        if not lead.visit_log or not lead.visit_log.work_order:
            raise HTTPException(status_code=400, detail="线索关联的拜访日志或工单不存在")
        # 使用工单的组长ID作为商机的team_leader_id
        actual_team_leader_id = lead.visit_log.work_order.team_leader_id
        if opportunity_data.team_leader_id != actual_team_leader_id:
            raise HTTPException(status_code=400, detail=f"商机的组长ID必须为线索所属工单的组长ID（{actual_team_leader_id}）")
    elif current_role.role == UserRole.TEAM_LEADER:
        if not lead.visit_log or not lead.visit_log.work_order:
            raise HTTPException(status_code=400, detail="线索关联的拜访日志或工单不存在")
        actual_team_leader_id = lead.visit_log.work_order.team_leader_id
        if actual_team_leader_id not in get_peer_team_leader_ids(db, current_user.id):
            raise HTTPException(status_code=403, detail="只能转换团队成员的线索")
        if opportunity_data.team_leader_id != actual_team_leader_id:
            raise HTTPException(
                status_code=400,
                detail=f"商机的组长ID必须为线索所属工单的组长ID（{actual_team_leader_id}）",
            )
    
    # 从线索获取任务ID（确保一致性）
    if opportunity_data.task_id != lead.task_id:
        raise HTTPException(status_code=400, detail="任务ID与线索关联的任务不一致")
    
    # 创建商机（自动从线索填充客户单位）
    opportunity = Opportunity(
        opportunity_no=opportunity_data.opportunity_no,
        lead_id=opportunity_data.lead_id,
        task_id=opportunity_data.task_id,
        customer_unit=opportunity_data.customer_unit,  # 从线索的customer_name转换而来
        required_products=opportunity_data.required_products,
        description=opportunity_data.description,
        expected_amount=opportunity_data.expected_amount,
        team_leader_id=opportunity_data.team_leader_id,
        status=OpportunityStatus.CREATED
    )
    db.add(opportunity)
    db.commit()
    db.refresh(opportunity)
    
    # 重新加载关联数据
    opportunity = db.query(Opportunity).options(
        joinedload(Opportunity.lead),
        joinedload(Opportunity.task),
        joinedload(Opportunity.team_leader),
        joinedload(Opportunity.collaborative_members).joinedload(CollaborativeMember.member)
    ).filter(Opportunity.id == opportunity.id).first()
    
    # 发送通知（通知失败不影响主业务）
    try:
        notify_opportunity_created(db, opportunity)
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to send opportunity created notification: {str(e)}")
    
    # 记录操作日志
    log_opportunity_action(
        db=db,
        user_id=current_user.id,
        action=AuditAction.CREATE,
        opportunity_id=opportunity.id,
        description=f"从线索创建商机：{opportunity.opportunity_no}，客户单位：{opportunity.customer_unit}",
        details={
            "opportunity_no": opportunity.opportunity_no,
            "customer_unit": opportunity.customer_unit,
            "task_id": opportunity.task_id,
            "lead_id": opportunity.lead_id
        },
        request=request
    )
    
    return OpportunityResponse.from_orm_with_relations(opportunity, db)


@router.get("", response_model=PaginatedResponse[OpportunityResponse])
def get_opportunities(
    task_id: Optional[int] = Query(None, description="任务ID筛选"),
    status: Optional[OpportunityStatus] = Query(None, description="状态筛选"),
    member_id: Optional[int] = Query(None, description="创建人ID筛选（通过线索关联）"),
    required_product: Optional[str] = Query(None, description="所需产品筛选"),
    start_date: Optional[str] = Query(None, description="创建时间起始日期（格式：YYYY-MM-DD）"),
    end_date: Optional[str] = Query(None, description="创建时间结束日期（格式：YYYY-MM-DD）"),
    search: Optional[str] = Query(None, description="搜索商机编号或客户单位"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(10, ge=1, le=100, description="每页数量"),
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """获取商机列表（基于当前激活角色权限，支持分页和搜索）"""
    from datetime import datetime
    from sqlalchemy import func
    
    current_user, current_role = user_role
    
    query = db.query(Opportunity)
    
    if task_id:
        query = query.filter(Opportunity.task_id == task_id)
    
    if status:
        query = query.filter(Opportunity.status == status)
    
    # 创建时间范围筛选
    if start_date:
        try:
            start_datetime = datetime.strptime(start_date, "%Y-%m-%d")
            query = query.filter(func.date(Opportunity.created_at) >= start_datetime.date())
        except ValueError:
            pass  # 忽略无效的日期格式
    
    if end_date:
        try:
            end_datetime = datetime.strptime(end_date, "%Y-%m-%d")
            query = query.filter(func.date(Opportunity.created_at) <= end_datetime.date())
        except ValueError:
            pass  # 忽略无效的日期格式
    
    # 所需产品筛选
    if required_product:
        # required_products字段可能是JSON数组字符串或单个字符串
        # 使用LIKE查询匹配包含该产品的记录
        product_pattern = f"%{required_product}%"
        query = query.filter(Opportunity.required_products.like(product_pattern))
    
    # 搜索功能
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            (Opportunity.opportunity_no.like(search_pattern)) |
            (Opportunity.customer_unit.like(search_pattern))
        )
    
    query = apply_opportunity_list_role_scope(
        query, db, current_user, current_role, member_id
    )

    # 获取总数（在应用distinct之前）
    total = query.count()
    
    # 分页
    pagination = PaginationParams(page=page, page_size=page_size)
    opportunities = query.options(
        joinedload(Opportunity.lead).joinedload(Lead.visit_log).joinedload(VisitLog.work_order),
        joinedload(Opportunity.task),
        joinedload(Opportunity.team_leader),
        joinedload(Opportunity.collaborative_members).joinedload(CollaborativeMember.member)
    ).order_by(Opportunity.created_at.desc()).offset(pagination.skip).limit(pagination.limit).all()
    
    # 转换为包含关联信息的响应对象
    opportunity_responses = [OpportunityResponse.from_orm_with_relations(opp, db) for opp in opportunities]
    
    return PaginatedResponse.create(opportunity_responses, total, page, page_size)


@router.get("/{opportunity_id}", response_model=OpportunityResponse)
def get_opportunity(
    opportunity_id: int,
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """获取商机详情（基于当前激活角色权限）"""
    current_user, current_role = user_role
    
    opportunity = db.query(Opportunity).options(
        joinedload(Opportunity.lead).joinedload(Lead.visit_log).joinedload(VisitLog.work_order),
        joinedload(Opportunity.task),
        joinedload(Opportunity.team_leader),
        joinedload(Opportunity.collaborative_members).joinedload(CollaborativeMember.member)
    ).filter(Opportunity.id == opportunity_id).first()
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="商机不存在")
    
    # 使用当前激活角色的权限进行检查（查看权限）
    user_sales_unit = current_role.sales_unit or current_user.sales_unit
    if not can_view_opportunity(current_role.role, current_user.id, opportunity, user_sales_unit, db=db):
        raise HTTPException(status_code=403, detail="无权查看此商机")
    
    return OpportunityResponse.from_orm_with_relations(opportunity, db)


@router.put("/{opportunity_id}", response_model=OpportunityResponse)
def update_opportunity(
    opportunity_id: int,
    opportunity_data: OpportunityUpdate,
    request: Request,
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """更新商机信息（成员和组长）"""
    current_user, current_role = user_role
    # 加载关联数据，用于权限检查
    opportunity = db.query(Opportunity).options(
        joinedload(Opportunity.lead).joinedload(Lead.visit_log).joinedload(VisitLog.work_order)
    ).filter(Opportunity.id == opportunity_id).first()
    if not opportunity:
        raise HTTPException(status_code=404, detail="商机不存在")
    
    # 权限检查：组长可以管理自己创建的商机，以及团队成员创建的商机
    if not can_manage_opportunity(current_role.role, current_user.id, opportunity, db=db):
        raise HTTPException(status_code=403, detail="无权修改此商机")
    
    old_status = opportunity.status
    # 使用 exclude_unset=True 获取明确设置的字段
    update_data = opportunity_data.dict(exclude_unset=True)
    
    # 特殊处理：检查 Pydantic 模型中的字段是否被设置（即使用户传递了 None）
    # 通过检查模型的 __fields_set__ 来确定哪些字段被明确设置了
    if hasattr(opportunity_data, '__fields_set__') and 'expected_amount' in opportunity_data.__fields_set__:
        update_data['expected_amount'] = opportunity_data.expected_amount
    
    try:
        # 如果更新状态，使用工作流
        status_changed = False
        if "status" in update_data:
            status_value = update_data.pop("status")
            lost_reason = update_data.pop("lost_reason", None)
            won_amount = update_data.pop("won_amount", None)
            try:
                old_status_value = str(opportunity.status.value) if hasattr(opportunity.status, 'value') else str(opportunity.status)
                opportunity = update_opportunity_status(
                    db, opportunity, status_value, lost_reason, won_amount
                )
                status_changed = True
                # 发送通知
                notify_opportunity_status_changed(db, opportunity, old_status_value)
            except WorkflowError as e:
                db.rollback()
                raise HTTPException(status_code=400, detail=str(e))
        
        # 更新其他字段
        for field, value in update_data.items():
            setattr(opportunity, field, value)
        
        # 统一提交事务
        db.commit()
        db.refresh(opportunity)
        
        # 记录操作日志
        if status_changed:
            status_labels = {
                "created": "已创建",
                "in_progress": "进行中",
                "lost": "流失",
                "won": "转定"
            }
            description = f"更新商机状态：{opportunity.opportunity_no}，状态：{status_labels.get(str(opportunity.status), str(opportunity.status))}"
            if opportunity.status == OpportunityStatus.LOST and lost_reason:
                description += f"，流失原因：{lost_reason}"
            elif opportunity.status == OpportunityStatus.WON and won_amount:
                description += f"，转定金额：{won_amount}"
        else:
            description = f"更新商机信息：{opportunity.opportunity_no}"
        
        log_opportunity_action(
            db=db,
            user_id=current_user.id,
            action=AuditAction.UPDATE,
            opportunity_id=opportunity.id,
            description=description,
            details={
                "old_status": str(old_status),
                "new_status": str(opportunity.status) if status_changed else None,
                "updated_fields": list(update_data.keys())
            },
            request=request
        )
    except HTTPException:
        # 重新抛出HTTP异常
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"更新商机失败：{str(e)}")
    
    # 重新加载关联数据
    opportunity = db.query(Opportunity).options(
        joinedload(Opportunity.lead),
        joinedload(Opportunity.task),
        joinedload(Opportunity.team_leader),
        joinedload(Opportunity.collaborative_members).joinedload(CollaborativeMember.member)
    ).filter(Opportunity.id == opportunity.id).first()
    
    return OpportunityResponse.from_orm_with_relations(opportunity, db)


@router.post("/{opportunity_id}/collaborative-members", response_model=CollaborativeMemberResponse, status_code=status.HTTP_201_CREATED)
def add_collaborative_member(
    opportunity_id: int,
    member_data: CollaborativeMemberCreate,
    request: Request,
    user_role: tuple = Depends(require_role(UserRole.MEMBER)),
    db: Session = Depends(get_db)
):
    """添加阶段性协同人员（成员）"""
    current_user, current_role = user_role
    
    # 加载商机及其关联的线索和工单，用于权限检查
    opportunity = db.query(Opportunity).options(
        joinedload(Opportunity.lead).joinedload(Lead.visit_log).joinedload(VisitLog.work_order)
    ).filter(Opportunity.id == opportunity_id).first()
    
    if not opportunity:
        raise HTTPException(status_code=404, detail="商机不存在")

    user_sales_unit = current_role.sales_unit or current_user.sales_unit

    # 权限检查：成员只能为自己创建的商机添加协同人员
    if not can_view_opportunity(current_role.role, current_user.id, opportunity, user_sales_unit, db=db):
        raise HTTPException(status_code=403, detail="无权为此商机添加协同人员")
    
    if member_data.member_id != current_user.id:
        raise HTTPException(status_code=403, detail="只能添加自己为协同人员")
    
    # 检查是否已存在
    existing = db.query(CollaborativeMember).filter(
        CollaborativeMember.opportunity_id == opportunity_id,
        CollaborativeMember.member_id == member_data.member_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="该成员已是协同人员")
    
    collaborative_member = CollaborativeMember(
        opportunity_id=opportunity_id,
        member_id=member_data.member_id,
        role=member_data.role,
        description=member_data.description
    )
    db.add(collaborative_member)
    db.commit()
    db.refresh(collaborative_member)
    
    # 重新加载商机关联数据以获取完整信息
    opportunity = db.query(Opportunity).options(
        joinedload(Opportunity.lead),
        joinedload(Opportunity.task),
        joinedload(Opportunity.team_leader)
    ).filter(Opportunity.id == opportunity_id).first()
    
    # 发送通知给被添加的协同人员（通知失败不影响主业务流程）
    try:
        notify_collaborative_member_added(db, opportunity, member_data.member_id)
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to send collaborative member notification: {str(e)}")
    
    # 记录操作日志
    log_opportunity_action(
        db=db,
        user_id=current_user.id,
        action=AuditAction.UPDATE,
        opportunity_id=opportunity.id,
        description=f"添加协同人员：{opportunity.opportunity_no}，成员：{current_user.real_name or current_user.username}",
        details={
            "member_id": member_data.member_id,
            "role": member_data.role,
            "action": "add_collaborative_member"
        },
        request=request
    )
    
    # 重新加载关联数据
    collaborative_member = db.query(CollaborativeMember).options(
        joinedload(CollaborativeMember.member)
    ).filter(CollaborativeMember.id == collaborative_member.id).first()
    
    from app.schemas.opportunity import CollaborativeMemberResponse
    return CollaborativeMemberResponse.from_orm_with_relations(collaborative_member)

