"""
线索 API
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models.user import User, UserRole
from app.models.lead import Lead
from app.models.task import Task, TaskDetailRequirement
from app.models.visit_log import VisitLog
from app.models.work_order import WorkOrder
from app.schemas.lead import LeadCreate, LeadUpdate, LeadResponse
from app.schemas.common import PaginationParams, PaginatedResponse
from app.api.deps import get_current_user, get_current_role, require_role
from app.core.audit import log_lead_action
from app.models.audit_log import AuditAction
from app.services.notification_service import notify_lead_created
from app.utils.lead_query_scope import apply_lead_list_role_scope
from app.utils.team_leader_peer_scope import get_peer_team_leader_ids
from fastapi import Request

router = APIRouter(prefix="/leads", tags=["线索管理"])


@router.post("", response_model=LeadResponse, status_code=status.HTTP_201_CREATED)
def create_lead(
    lead_data: LeadCreate,
    request: Request,
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """创建线索（成员或组长）"""
    current_user, current_role = user_role
    
    # 验证角色：只有成员和组长可以创建线索
    if current_role.role not in [UserRole.MEMBER, UserRole.TEAM_LEADER]:
        raise HTTPException(status_code=403, detail="只有成员和组长可以创建线索")
    
    # 验证拜访日志是否存在
    visit_log = db.query(VisitLog).options(
        joinedload(VisitLog.work_order).joinedload(WorkOrder.task)
    ).filter(VisitLog.id == lead_data.visit_log_id).first()
    
    if not visit_log:
        raise HTTPException(status_code=404, detail="拜访日志不存在")
    
    # 权限检查：成员只能为自己的拜访日志创建线索，组长可以为团队成员的拜访日志创建线索
    if current_role.role == UserRole.MEMBER:
        if visit_log.member_id != current_user.id:
            raise HTTPException(status_code=403, detail="只能为自己的拜访日志创建线索")
    elif current_role.role == UserRole.TEAM_LEADER:
        wo_tl = visit_log.work_order.team_leader_id if visit_log.work_order else None
        if wo_tl is None or wo_tl not in get_peer_team_leader_ids(db, current_user.id):
            raise HTTPException(status_code=403, detail="只能为团队成员的拜访日志创建线索")
    
    # 从拜访日志获取任务ID
    if not visit_log.work_order or not visit_log.work_order.task:
        raise HTTPException(status_code=400, detail="拜访日志关联的工单或任务不存在")
    
    task_id = visit_log.work_order.task_id
    
    # 验证任务是否存在
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    
    # 确保task_id一致
    if lead_data.task_id != task_id:
        raise HTTPException(status_code=400, detail="任务ID与拜访日志关联的任务不一致")
    
    lead = Lead(
        visit_log_id=lead_data.visit_log_id,
        task_id=lead_data.task_id,
        customer_name=lead_data.customer_name,
        requirement_direction=lead_data.requirement_direction,
        detail_description=lead_data.detail_description,
        member_id=current_user.id
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)
    
    # 重新加载关联数据（用于通知）
    lead = db.query(Lead).options(
        joinedload(Lead.visit_log).joinedload(VisitLog.work_order),
        joinedload(Lead.task)
    ).filter(Lead.id == lead.id).first()
    
    # 发送通知（通知失败不影响主业务流程）
    try:
        notify_lead_created(db, lead)
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to send lead creation notification: {str(e)}")
    
    # 记录操作日志
    log_lead_action(
        db=db,
        user_id=current_user.id,
        action=AuditAction.CREATE,
        lead_id=lead.id,
        description=f"创建线索：客户 {lead.customer_name}，任务 {task.task_name}，拜访日志 {visit_log.id}",
        details={
            "visit_log_id": visit_log.id,
            "task_id": task.id,
            "task_name": task.task_name,
            "customer_name": lead.customer_name,
            "requirement_direction": lead.requirement_direction
        },
        request=request
    )
    
    # 重新加载关联数据
    lead = db.query(Lead).options(
        joinedload(Lead.visit_log).joinedload(VisitLog.work_order).joinedload(WorkOrder.task),
        joinedload(Lead.task),
        joinedload(Lead.member),
        joinedload(Lead.opportunity)  # 加载商机关系（新创建的线索不会有，但保持一致性）
    ).filter(Lead.id == lead.id).first()
    
    return LeadResponse.from_orm_with_relations(lead, db)


@router.get("", response_model=PaginatedResponse[LeadResponse])
def get_leads(
    task_id: Optional[int] = Query(None, description="任务ID筛选"),
    member_id: Optional[int] = Query(None, description="创建人ID筛选"),
    has_opportunity: Optional[bool] = Query(None, description="是否已转换为商机筛选"),
    requirement_direction: Optional[str] = Query(None, description="客户需求方向筛选"),
    start_date: Optional[str] = Query(None, description="创建时间起始日期（格式：YYYY-MM-DD）"),
    end_date: Optional[str] = Query(None, description="创建时间结束日期（格式：YYYY-MM-DD）"),
    search: Optional[str] = Query(None, description="搜索客户名称"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(10, ge=1, le=100, description="每页数量"),
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """获取线索列表（基于当前激活角色权限，支持分页和搜索）"""
    from datetime import datetime
    from sqlalchemy import func, and_
    
    current_user, current_role = user_role
    
    query = db.query(Lead).options(
        joinedload(Lead.visit_log),
        joinedload(Lead.task),
        joinedload(Lead.member),
        joinedload(Lead.opportunity)  # 加载商机关系，用于列表显示状态
    )
    
    if task_id:
        query = query.filter(Lead.task_id == task_id)
    
    # 创建人筛选
    if member_id:
        query = query.filter(Lead.member_id == member_id)
    
    # 商机状态筛选（是否已转换为商机）
    if has_opportunity is not None:
        if has_opportunity:
            # 已转换：存在关联的商机
            query = query.filter(Lead.opportunity.has())
        else:
            # 未转换：不存在关联的商机
            query = query.filter(~Lead.opportunity.has())
    
    # 创建时间范围筛选
    if start_date:
        try:
            start_datetime = datetime.strptime(start_date, "%Y-%m-%d")
            query = query.filter(func.date(Lead.created_at) >= start_datetime.date())
        except ValueError:
            pass  # 忽略无效的日期格式
    
    if end_date:
        try:
            end_datetime = datetime.strptime(end_date, "%Y-%m-%d")
            query = query.filter(func.date(Lead.created_at) <= end_datetime.date())
        except ValueError:
            pass  # 忽略无效的日期格式
    
    # 客户需求方向筛选
    if requirement_direction:
        # requirement_direction字段可能是JSON数组字符串或单个字符串
        # 使用LIKE查询匹配包含该需求方向的记录
        requirement_pattern = f"%{requirement_direction}%"
        query = query.filter(Lead.requirement_direction.like(requirement_pattern))
    
    # 搜索功能
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(Lead.customer_name.like(search_pattern))
    
    query = apply_lead_list_role_scope(query, db, current_user, current_role)

    # 获取总数
    total = query.count()
    
    # 分页
    pagination = PaginationParams(page=page, page_size=page_size)
    leads = query.order_by(Lead.created_at.desc()).offset(pagination.skip).limit(pagination.limit).all()
    
    # 转换为包含关联信息的响应对象
    lead_responses = [LeadResponse.from_orm_with_relations(lead, db) for lead in leads]
    
    return PaginatedResponse.create(lead_responses, total, page, page_size)


@router.get("/{lead_id}", response_model=LeadResponse)
def get_lead(
    lead_id: int,
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """获取线索详情（基于当前激活角色权限）"""
    current_user, current_role = user_role
    
    lead = db.query(Lead).options(
        joinedload(Lead.visit_log).joinedload(VisitLog.work_order),  # 加载工单信息，用于获取team_leader_id
        joinedload(Lead.task),
        joinedload(Lead.member),
        joinedload(Lead.opportunity)  # 加载商机关系，用于检查是否已转换
    ).filter(Lead.id == lead_id).first()
    
    if not lead:
        raise HTTPException(status_code=404, detail="线索不存在")
    
    # 权限检查
    from app.core.permissions import can_view_lead
    
    user_sales_unit = current_role.sales_unit or current_user.sales_unit
    
    # 获取工单关联的需求信息（用于销售单位接口人的权限判断）
    requirement_sales_contact_id = None
    requirement_sales_unit = None
    if lead.visit_log and lead.visit_log.work_order and lead.visit_log.work_order.detail_requirement:
        requirement = lead.visit_log.work_order.detail_requirement
        requirement_sales_contact_id = requirement.sales_contact_id
        if requirement.sales_contact:
            requirement_sales_unit = requirement.sales_contact.sales_unit
    
    if not can_view_lead(
        current_role.role,
        current_user.id,
        lead,
        user_sales_unit,
        requirement_sales_contact_id,
        requirement_sales_unit,
        db=db,
    ):
        raise HTTPException(status_code=403, detail="无权查看此线索")
    
    return LeadResponse.from_orm_with_relations(lead, db)


@router.put("/{lead_id}", response_model=LeadResponse)
def update_lead(
    lead_id: int,
    lead_data: LeadUpdate,
    request: Request,
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """更新线索（成员或组长）"""
    current_user, current_role = user_role
    lead = db.query(Lead).options(
        joinedload(Lead.task),
        joinedload(Lead.visit_log)
    ).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="线索不存在")
    
    # 权限检查：成员只能修改自己创建的线索，组长可以修改团队成员的线索
    if current_role.role == UserRole.MEMBER:
        if lead.member_id != current_user.id:
            raise HTTPException(status_code=403, detail="无权修改此线索")
    elif current_role.role == UserRole.TEAM_LEADER:
        visit_log = lead.visit_log
        wo_tl = visit_log.work_order.team_leader_id if visit_log and visit_log.work_order else None
        if wo_tl is None or wo_tl not in get_peer_team_leader_ids(db, current_user.id):
            raise HTTPException(status_code=403, detail="无权修改此线索")
    else:
        raise HTTPException(status_code=403, detail="只有成员和组长可以修改线索")
    
    update_data = lead_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(lead, field, value)
    
    db.commit()
    
    # 记录操作日志
    log_lead_action(
        db=db,
        user_id=current_user.id,
        action=AuditAction.UPDATE,
        lead_id=lead.id,
        description=f"更新线索：客户 {lead.customer_name}",
        details={
            "task_id": lead.task_id,
            "updated_fields": list(update_data.keys())
        },
        request=request
    )
    
    # 重新加载关联数据
    lead = db.query(Lead).options(
        joinedload(Lead.visit_log).joinedload(VisitLog.work_order),  # 加载工单信息
        joinedload(Lead.task),
        joinedload(Lead.member),
        joinedload(Lead.opportunity)  # 加载商机关系
    ).filter(Lead.id == lead.id).first()
    
    return LeadResponse.from_orm_with_relations(lead, db)


@router.delete("/{lead_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lead(
    lead_id: int,
    request: Request,
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """删除线索（成员或组长）"""
    current_user, current_role = user_role
    lead = db.query(Lead).options(
        joinedload(Lead.visit_log)
    ).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="线索不存在")
    
    # 权限检查：成员只能删除自己创建的线索，组长可以删除团队成员的线索
    if current_role.role == UserRole.MEMBER:
        if lead.member_id != current_user.id:
            raise HTTPException(status_code=403, detail="无权删除此线索")
    elif current_role.role == UserRole.TEAM_LEADER:
        visit_log = lead.visit_log
        wo_tl = visit_log.work_order.team_leader_id if visit_log and visit_log.work_order else None
        if wo_tl is None or wo_tl not in get_peer_team_leader_ids(db, current_user.id):
            raise HTTPException(status_code=403, detail="无权删除此线索")
    else:
        raise HTTPException(status_code=403, detail="只有成员和组长可以删除线索")
    
    # 记录操作日志
    log_lead_action(
        db=db,
        user_id=current_user.id,
        action=AuditAction.DELETE,
        lead_id=lead.id,
        description=f"删除线索：客户 {lead.customer_name}",
        details={
            "task_id": lead.task_id,
            "customer_name": lead.customer_name
        },
        request=request
    )
    
    db.delete(lead)
    db.commit()
    
    return None

