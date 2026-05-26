"""
复盘管理 API
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models.user import User, UserRole
from app.models.review import Review
from app.models.visit_log import VisitLog
from app.models.work_order import WorkOrder
from app.schemas.review import ReviewCreate, ReviewUpdate, ReviewResponse
from app.schemas.common import PaginationParams, PaginatedResponse
from app.api.deps import get_current_user, get_current_role, require_role
from app.core.permissions import can_manage_work_order, can_view_work_order
from app.core.audit import log_review_action
from app.models.audit_log import AuditAction
from app.services.notification_service import notify_review_created
from app.utils.team_leader_peer_scope import get_peer_team_leader_ids
from fastapi import Request

router = APIRouter(prefix="/reviews", tags=["复盘管理"])


@router.post("", response_model=ReviewResponse, status_code=status.HTTP_201_CREATED)
def create_review(
    review_data: ReviewCreate,
    request: Request,
    user_role: tuple = Depends(require_role(UserRole.TEAM_LEADER)),
    db: Session = Depends(get_db)
):
    """创建复盘（组长）"""
    current_user, current_role = user_role
    # 验证拜访日志是否存在
    visit_log = db.query(VisitLog).options(
        joinedload(VisitLog.work_order).joinedload(WorkOrder.task)
    ).filter(VisitLog.id == review_data.visit_log_id).first()
    if not visit_log:
        raise HTTPException(status_code=404, detail="拜访日志不存在")
    
    # 验证工单是否属于当前组长
    work_order = visit_log.work_order
    if work_order.team_leader_id not in get_peer_team_leader_ids(db, current_user.id):
        raise HTTPException(status_code=403, detail="无权操作此拜访日志")
    
    # 检查是否已有复盘
    existing_review = db.query(Review).filter(Review.visit_log_id == review_data.visit_log_id).first()
    if existing_review:
        raise HTTPException(status_code=400, detail="该拜访日志已有复盘记录")
    
    review = Review(
        **review_data.dict(),
        team_leader_id=current_user.id
    )
    db.add(review)
    db.commit()
    db.refresh(review)
    
    # 发送通知（通知失败不影响主业务）
    try:
        notify_review_created(db, review)
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to send review created notification: {str(e)}")
    
    # 记录操作日志
    log_review_action(
        db=db,
        user_id=current_user.id,
        action=AuditAction.CREATE,
        review_id=review.id,
        description=f"创建复盘：工单 {work_order.work_order_no}，任务：{work_order.task.task_name if work_order.task else ''}",
        details={
            "visit_log_id": visit_log.id,
            "work_order_id": work_order.id,
            "work_order_no": work_order.work_order_no,
            "task_name": work_order.task.task_name if work_order.task else None
        },
        request=request
    )
    
    # 重新加载关联数据
    review = db.query(Review).options(
        joinedload(Review.visit_log).joinedload(VisitLog.work_order).joinedload(WorkOrder.task),
        joinedload(Review.team_leader)
    ).filter(Review.id == review.id).first()
    
    return ReviewResponse.from_orm_with_relations(review)


@router.get("", response_model=PaginatedResponse[ReviewResponse])
def get_reviews(
    visit_log_id: Optional[int] = Query(None, description="拜访日志ID筛选"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(10, ge=1, le=100, description="每页数量"),
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """获取复盘列表（基于当前激活角色权限，支持分页）"""
    current_user, current_role = user_role
    
    query = db.query(Review).options(
        joinedload(Review.visit_log).joinedload(VisitLog.work_order).joinedload(WorkOrder.task),
        joinedload(Review.team_leader)
    )
    
    if visit_log_id:
        query = query.filter(Review.visit_log_id == visit_log_id)
    
    # 基于当前激活角色进行数据过滤
    # 组长只能看到自己团队的复盘
    if current_role.role == UserRole.TEAM_LEADER:
        peer_ids = get_peer_team_leader_ids(db, current_user.id)
        query = query.filter(Review.team_leader_id.in_(peer_ids))
    # 总管可以看到所有复盘
    
    # 获取总数
    total = query.count()
    
    # 分页
    pagination = PaginationParams(page=page, page_size=page_size)
    reviews = query.order_by(Review.created_at.desc()).offset(pagination.skip).limit(pagination.limit).all()
    
    # 转换为包含关联信息的响应对象
    review_responses = [ReviewResponse.from_orm_with_relations(r) for r in reviews]
    
    return PaginatedResponse.create(review_responses, total, page, page_size)


@router.get("/{review_id}", response_model=ReviewResponse)
def get_review(
    review_id: int,
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """获取复盘详情（基于当前激活角色权限）"""
    current_user, current_role = user_role
    
    review = db.query(Review).options(
        joinedload(Review.visit_log).joinedload(VisitLog.work_order).joinedload(WorkOrder.task),
        joinedload(Review.team_leader)
    ).filter(Review.id == review_id).first()
    
    if not review:
        raise HTTPException(status_code=404, detail="复盘不存在")
    
    # 使用当前激活角色的权限进行检查
    work_order = review.visit_log.work_order
    user_sales_unit = current_role.sales_unit or current_user.sales_unit
    if not can_view_work_order(current_role.role, current_user.id, work_order, user_sales_unit, db=db):
        raise HTTPException(status_code=403, detail="无权查看此复盘")
    
    return ReviewResponse.from_orm_with_relations(review)


@router.put("/{review_id}", response_model=ReviewResponse)
def update_review(
    review_id: int,
    review_data: ReviewUpdate,
    request: Request,
    user_role: tuple = Depends(require_role(UserRole.TEAM_LEADER)),
    db: Session = Depends(get_db)
):
    """更新复盘（组长）"""
    current_user, current_role = user_role
    review = db.query(Review).options(
        joinedload(Review.visit_log).joinedload(VisitLog.work_order).joinedload(WorkOrder.task)
    ).filter(Review.id == review_id).first()
    if not review:
        raise HTTPException(status_code=404, detail="复盘不存在")
    
    if review.team_leader_id not in get_peer_team_leader_ids(db, current_user.id):
        raise HTTPException(status_code=403, detail="无权修改此复盘")
    
    update_data = review_data.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(review, field, value)
    
    db.commit()
    
    # 记录操作日志
    work_order = review.visit_log.work_order if review.visit_log else None
    log_review_action(
        db=db,
        user_id=current_user.id,
        action=AuditAction.UPDATE,
        review_id=review.id,
        description=f"更新复盘：工单 {work_order.work_order_no if work_order else ''}",
        details={
            "visit_log_id": review.visit_log_id,
            "updated_fields": list(update_data.keys())
        },
        request=request
    )
    
    # 重新加载关联数据
    review = db.query(Review).options(
        joinedload(Review.visit_log).joinedload(VisitLog.work_order).joinedload(WorkOrder.task),
        joinedload(Review.team_leader)
    ).filter(Review.id == review.id).first()
    
    return ReviewResponse.from_orm_with_relations(review)

