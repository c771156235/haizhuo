"""
拜访日志 API
"""
import json
from datetime import datetime, timezone
from typing import List, Optional, Tuple
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models.user import User, UserRole
from app.models.visit_log import VisitLog
from app.models.visit_log_maintenance_log import VisitLogMaintenanceLog
from app.models.work_order import WorkOrder, WorkOrderStatus
from app.models.task import TaskDetailRequirement
from app.schemas.visit_log import (
    VisitLogCreate,
    VisitLogMaintenanceUpdate,
    VisitLogResponse,
    VISIT_LOG_DECISION_AUTHORITY_OPTIONS,
    normalize_stage_effort_breakdown_json,
)
from app.utils.visit_log_progress_history import append_progress_entry
from app.schemas.common import PaginationParams, PaginatedResponse
from app.api.deps import get_current_user, get_current_role, require_role
from app.core.permissions import can_manage_work_order, can_view_work_order
from app.utils.visit_log_query_scope import (
    apply_visit_log_role_scope,
    visit_log_standard_loader_options,
)
from app.api.work_orders import get_fde_group_name_for_team_leader
from app.core.audit import log_visit_log_action
from app.models.audit_log import AuditAction
from app.services.notification_service import notify_visit_log_created
from app.services.work_order_completion import (
    post_commit_work_order_completed_followup,
    set_work_order_completed_at_if_missing,
)
from app.core.workflow import check_and_update_task_completion_status
from fastapi import Request

router = APIRouter(prefix="/visit-logs", tags=["拜访日志"])


def resolve_visit_log_customer_unit_snapshot(work_order: WorkOrder) -> Optional[str]:
    """与工单展示一致：详细需求优先，否则任务级客户单位。"""
    if work_order.detail_requirement and work_order.detail_requirement.customer_unit:
        return work_order.detail_requirement.customer_unit
    if work_order.task and work_order.task.customer_unit:
        return work_order.task.customer_unit
    return None


def resolve_visit_log_sales_unit_snapshot(work_order: WorkOrder) -> Optional[str]:
    """与工单「客户来源」一致：详细需求 customer_source；无则回退任务 sales_unit（兼容旧数据）。"""
    if work_order.detail_requirement and work_order.detail_requirement.customer_source:
        s = work_order.detail_requirement.customer_source
        if isinstance(s, str):
            t = s.strip()
            if t:
                return t
        elif s is not None:
            t = str(s).strip()
            if t:
                return t
    if work_order.task and work_order.task.sales_unit is not None:
        s = work_order.task.sales_unit
        if isinstance(s, str):
            t = s.strip()
            return t if t else None
        return str(s)
    return None


def resolve_visit_log_detail_contact_snapshot(
    work_order: WorkOrder,
) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """详细需求上的拜访地址与客户经理快照；无详细需求则为空。"""
    if not work_order.detail_requirement:
        return None, None, None
    dr = work_order.detail_requirement
    return (
        dr.customer_visit_address,
        dr.customer_manager_name,
        dr.customer_manager_contact,
    )


@router.post("", response_model=VisitLogResponse, status_code=status.HTTP_201_CREATED)
def create_visit_log(
    visit_log_data: VisitLogCreate,
    request: Request,
    user_role: tuple = Depends(require_role(UserRole.MEMBER)),
    db: Session = Depends(get_db)
):
    """添加拜访日志（成员）"""
    current_user, current_role = user_role
    # 验证工单是否属于当前用户
    work_order = db.query(WorkOrder).options(
        joinedload(WorkOrder.task),
        joinedload(WorkOrder.detail_requirement),
    ).filter(WorkOrder.id == visit_log_data.work_order_id).first()
    if not work_order:
        raise HTTPException(status_code=404, detail="工单不存在")
    
    if work_order.member_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权操作此工单")
    
    # 检查工单状态：已拜访或已取消的工单不能创建拜访日志
    if work_order.status == WorkOrderStatus.COMPLETED.value:
        raise HTTPException(
            status_code=400,
            detail="已拜访状态的工单不能创建拜访日志"
        )
    if work_order.status == WorkOrderStatus.CANCELLED.value:
        raise HTTPException(
            status_code=400,
            detail="已取消工单不能创建拜访日志"
        )
    if work_order.status not in (
        WorkOrderStatus.ACCEPTED.value,
        WorkOrderStatus.IN_PROGRESS.value,
    ):
        raise HTTPException(
            status_code=400,
            detail="当前工单状态不允许添加拜访日志，请先接单或联系管理员",
        )

    # 检查该工单是否已经有拜访日志（每个工单只能有一个拜访日志）
    existing_visit_log = db.query(VisitLog).filter(
        VisitLog.work_order_id == visit_log_data.work_order_id
    ).first()
    if existing_visit_log:
        raise HTTPException(
            status_code=400, 
            detail=f"该工单已存在拜访日志，每个工单只能创建一个拜访日志。已有拜访日志ID：{existing_visit_log.id}"
        )
    
    fde_group_name = get_fde_group_name_for_team_leader(db, work_order.team_leader_id)
    customer_unit_snapshot = resolve_visit_log_customer_unit_snapshot(work_order)
    sales_unit_snapshot = resolve_visit_log_sales_unit_snapshot(work_order)
    addr_snap, mgr_name_snap, mgr_contact_snap = resolve_visit_log_detail_contact_snapshot(
        work_order
    )
    visit_log = VisitLog(
        **visit_log_data.model_dump(),
        member_id=current_user.id,
        sales_unit=sales_unit_snapshot,
        group_name=fde_group_name,
        customer_unit=customer_unit_snapshot,
        customer_visit_address=addr_snap,
        customer_manager_name=mgr_name_snap,
        customer_manager_contact=mgr_contact_snap,
    )
    db.add(visit_log)

    # 首次创建拜访日志后，工单从「已接单/进行中」直接变为「已拜访」（不再经过「进行中」）
    old_work_order_status = work_order.status
    transitioned_to_completed = False
    if old_work_order_status in (
        WorkOrderStatus.ACCEPTED.value,
        WorkOrderStatus.IN_PROGRESS.value,
    ):
        work_order.status = WorkOrderStatus.COMPLETED.value
        set_work_order_completed_at_if_missing(work_order)
        transitioned_to_completed = True

    if work_order.task:
        check_and_update_task_completion_status(db, work_order.task)

    db.commit()
    db.refresh(visit_log)
    db.refresh(work_order)
    
    # 发送通知（通知失败不影响主业务）
    try:
        notify_visit_log_created(db, visit_log)
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to send visit log created notification: {str(e)}")
    
    # 记录拜访日志操作日志
    description = f"添加拜访日志：工单 {work_order.work_order_no}"
    
    log_visit_log_action(
        db=db,
        user_id=current_user.id,
        action=AuditAction.CREATE,
        visit_log_id=visit_log.id,
        description=description,
        details={
            "work_order_id": work_order.id,
            "work_order_no": work_order.work_order_no,
            "task_name": work_order.task.task_name if work_order.task else None,
            "visit_date": str(visit_log.visit_date),
            "opportunity_no": visit_log.opportunity_no
        },
        request=request
    )
    db.commit()

    if transitioned_to_completed:
        if old_work_order_status == WorkOrderStatus.ACCEPTED.value:
            label_old = "已接单"
        else:
            # 兼容库中仍为 in_progress 的旧工单，不在文案中使用已废弃的中间态名称
            label_old = "历史工单状态"
        post_commit_work_order_completed_followup(
            db,
            work_order,
            actor_user_id=current_user.id,
            request=request,
            old_status=old_work_order_status,
            audit_description=(
                f"创建拜访日志并标记工单已拜访：{work_order.work_order_no}（{label_old}→已拜访）"
            ),
            audit_trigger="visit_log_created",
        )

    # 重新加载关联数据
    visit_log = db.query(VisitLog).options(
        joinedload(VisitLog.work_order).joinedload(WorkOrder.task),
        joinedload(VisitLog.work_order).joinedload(WorkOrder.detail_requirement),
        joinedload(VisitLog.member)
    ).filter(VisitLog.id == visit_log.id).first()
    
    return VisitLogResponse.from_orm_with_relations(visit_log, db)


@router.get("", response_model=PaginatedResponse[VisitLogResponse])
def get_visit_logs(
    work_order_id: Optional[int] = Query(None, description="工单ID筛选"),
    work_order_no: Optional[str] = Query(None, description="工单编号筛选"),
    task_id: Optional[int] = Query(None, description="任务ID筛选"),
    member_id: Optional[int] = Query(None, description="创建人ID筛选"),
    has_clue: Optional[bool] = Query(None, description="是否有线索筛选"),
    has_requirement_scenario_sorted: Optional[bool] = Query(
        None, description="客户是否梳理过需求场景筛选"
    ),
    has_decision_authority: Optional[str] = Query(
        None, description="拜访对象权限筛选：建议权、决策权、无"
    ),
    start_date: Optional[str] = Query(None, description="创建时间起始日期（格式：YYYY-MM-DD）"),
    end_date: Optional[str] = Query(None, description="创建时间结束日期（格式：YYYY-MM-DD）"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(10, ge=1, le=1000, description="每页数量"),
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """获取拜访日志列表（基于当前激活角色权限，支持分页和筛选）"""
    current_user, current_role = user_role
    
    query = db.query(VisitLog).options(*visit_log_standard_loader_options())
    
    # 如果提供了工单编号，先通过工单编号找到工单ID
    if work_order_no:
        work_order = db.query(WorkOrder).filter(WorkOrder.work_order_no == work_order_no).first()
        if work_order:
            query = query.filter(VisitLog.work_order_id == work_order.id)
        else:
            # 如果工单不存在，返回空结果
            query = query.filter(VisitLog.work_order_id == -1)
    
    if work_order_id:
        query = query.filter(VisitLog.work_order_id == work_order_id)

    if has_clue is not None:
        query = query.filter(VisitLog.has_clue == has_clue)
    
    if has_requirement_scenario_sorted is not None:
        query = query.filter(
            VisitLog.has_requirement_scenario_sorted == has_requirement_scenario_sorted
        )
    
    if has_decision_authority is not None:
        if has_decision_authority not in VISIT_LOG_DECISION_AUTHORITY_OPTIONS:
            raise HTTPException(
                status_code=400,
                detail=f"拜访对象权限筛选值无效，须为：{', '.join(VISIT_LOG_DECISION_AUTHORITY_OPTIONS)}",
            )
        query = query.filter(VisitLog.has_decision_authority == has_decision_authority)
    
    # 任务筛选（通过工单关联）
    if task_id:
        query = query.join(WorkOrder).filter(WorkOrder.task_id == task_id)
    
    # 创建人筛选
    if member_id:
        query = query.filter(VisitLog.member_id == member_id)
    
    # 日期范围筛选
    if start_date:
        from datetime import datetime
        try:
            start_datetime = datetime.strptime(start_date, '%Y-%m-%d')
            query = query.filter(VisitLog.created_at >= start_datetime)
        except ValueError:
            pass  # 日期格式错误，忽略该筛选条件
    
    if end_date:
        from datetime import datetime, timedelta
        try:
            # 结束日期需要包含当天的所有时间，所以加一天并减去一秒
            end_datetime = datetime.strptime(end_date, '%Y-%m-%d') + timedelta(days=1) - timedelta(seconds=1)
            query = query.filter(VisitLog.created_at <= end_datetime)
        except ValueError:
            pass  # 日期格式错误，忽略该筛选条件
    
    query = apply_visit_log_role_scope(query, db, current_user, current_role)
    
    # 获取总数
    total = query.count()
    
    # 分页
    pagination = PaginationParams(page=page, page_size=page_size)
    visit_logs = query.order_by(VisitLog.visit_date.desc(), VisitLog.created_at.desc()).offset(pagination.skip).limit(pagination.limit).all()
    
    # 转换为包含关联信息的响应对象
    visit_log_responses = [
        VisitLogResponse.from_orm_with_relations(vl, db) for vl in visit_logs
    ]
    
    return PaginatedResponse.create(visit_log_responses, total, page, page_size)


@router.get("/{visit_log_id}", response_model=VisitLogResponse)
def get_visit_log(
    visit_log_id: int,
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """获取拜访日志详情（基于当前激活角色权限）"""
    current_user, current_role = user_role
    
    visit_log = db.query(VisitLog).options(
        joinedload(VisitLog.work_order).joinedload(WorkOrder.task),
        joinedload(VisitLog.work_order).joinedload(WorkOrder.detail_requirement),
        joinedload(VisitLog.member)
    ).filter(VisitLog.id == visit_log_id).first()
    
    if not visit_log:
        raise HTTPException(status_code=404, detail="拜访日志不存在")
    
    # 使用当前激活角色的权限进行检查
    work_order = visit_log.work_order
    user_sales_unit = current_role.sales_unit or current_user.sales_unit
    if not can_view_work_order(current_role.role, current_user.id, work_order, user_sales_unit, db=db):
        raise HTTPException(status_code=403, detail="无权查看此拜访日志")
    
    return VisitLogResponse.from_orm_with_relations(visit_log, db)


@router.put("/{visit_log_id}", response_model=VisitLogResponse)
def update_visit_log(
    visit_log_id: int,
    visit_log_data: VisitLogMaintenanceUpdate,
    request: Request,
    user_role: tuple = Depends(require_role(UserRole.MEMBER)),
    db: Session = Depends(get_db)
):
    """线索维护窄域更新（成员）：仅可更新线索对应产品、预估金额、当前阶段、推进进展（追加）、推进要求"""
    current_user, current_role = user_role
    visit_log = db.query(VisitLog).options(
        joinedload(VisitLog.work_order).joinedload(WorkOrder.task),
        joinedload(VisitLog.work_order).joinedload(WorkOrder.detail_requirement)
    ).filter(VisitLog.id == visit_log_id).first()
    if not visit_log:
        raise HTTPException(status_code=404, detail="拜访日志不存在")

    if visit_log.member_id != current_user.id:
        raise HTTPException(status_code=403, detail="无权修改此拜访日志")

    fs = visit_log_data.model_fields_set
    data = visit_log_data.model_dump()
    append_raw = data.pop("promotion_progress_append", None)
    append_text = (append_raw or "").strip() if append_raw is not None else ""

    def _norm_str(a: Optional[str], b: Optional[str]) -> bool:
        return (a or "").strip() == (b or "").strip()

    changed: list[str] = []

    if "clue_related_products" in fs:
        new_clue = data.get("clue_related_products")
        if not _norm_str(new_clue, visit_log.clue_related_products):
            changed.append("clue_related_products")
            visit_log.clue_related_products = new_clue

    if "project_amount" in fs:
        new_amount = data.get("project_amount")
        if not _norm_str(new_amount, visit_log.project_amount):
            changed.append("project_amount")
            visit_log.project_amount = new_amount

    if "current_stage" in fs:
        new_stage = data.get("current_stage")
        if new_stage != visit_log.current_stage:
            changed.append("current_stage")
            visit_log.current_stage = new_stage
            visit_log.stage_effort_breakdown = None

    if "stage_effort_breakdown" in fs:
        eff_raw = data.get("stage_effort_breakdown")
        try:
            normalized = normalize_stage_effort_breakdown_json(
                visit_log.current_stage, eff_raw
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        if normalized != visit_log.stage_effort_breakdown:
            changed.append("stage_effort_breakdown")
            visit_log.stage_effort_breakdown = normalized

    if "promotion_requirements" in fs:
        new_req = data.get("promotion_requirements")
        if not _norm_str(new_req, visit_log.promotion_requirements):
            changed.append("promotion_requirements")
            visit_log.promotion_requirements = new_req

    if append_text:
        changed.append("promotion_progress")
        op_name = (current_user.real_name or current_user.username or "").strip()
        hist, plain = append_progress_entry(
            getattr(visit_log, "promotion_progress_history", None),
            legacy_plain=visit_log.promotion_progress,
            user_id=current_user.id,
            user_name=op_name,
            text=append_text,
            at=datetime.now(timezone.utc),
        )
        visit_log.promotion_progress_history = hist
        visit_log.promotion_progress = plain

    if not changed:
        raise HTTPException(status_code=400, detail="没有修改任何内容")

    maint = VisitLogMaintenanceLog(
        visit_log_id=visit_log.id,
        operator_id=current_user.id,
        fields_changed=json.dumps(changed, ensure_ascii=False),
    )
    db.add(maint)
    db.commit()
    db.refresh(visit_log)

    log_visit_log_action(
        db=db,
        user_id=current_user.id,
        action=AuditAction.UPDATE,
        visit_log_id=visit_log.id,
        description=f"线索维护更新：工单 {visit_log.work_order.work_order_no if visit_log.work_order else ''}",
        details={
            "work_order_id": visit_log.work_order_id,
            "maintenance_fields": changed,
        },
        request=request,
    )

    visit_log = db.query(VisitLog).options(
        joinedload(VisitLog.work_order).joinedload(WorkOrder.task),
        joinedload(VisitLog.work_order).joinedload(WorkOrder.detail_requirement),
        joinedload(VisitLog.member),
    ).filter(VisitLog.id == visit_log.id).first()

    return VisitLogResponse.from_orm_with_relations(visit_log, db)

