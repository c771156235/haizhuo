"""
通知管理 API
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from datetime import datetime
from app.database import get_db
from app.models.user import User, UserRole
from app.models.notification import Notification, NotificationType
from app.schemas.notification import NotificationResponse, NotificationUpdate
from app.schemas.common import PaginatedResponse
from app.api.deps import get_current_user, get_current_role

router = APIRouter(prefix="/notifications", tags=["通知管理"])


def get_notification_types_for_role(role: UserRole) -> List[str]:
    """根据角色返回相关的通知类型列表"""
    role_notification_map = {
        UserRole.MANAGER: [
            NotificationType.TASK_PENDING.value,
            NotificationType.TASK_DETAIL_SUBMITTED.value,
            NotificationType.WORK_ORDER_COMPLETED.value,
            NotificationType.OPPORTUNITY_CREATED.value,
            NotificationType.OPPORTUNITY_STATUS_CHANGED.value,
            NotificationType.LEAD_CREATED.value,
            NotificationType.USER_REGISTRATION_PENDING.value,
        ],
        UserRole.TASK_INITIATOR: [
            NotificationType.TASK_CONFIRMED.value,
            NotificationType.TASK_REJECTED.value,
            NotificationType.WORK_ORDER_COMPLETED.value,
        ],
        UserRole.SALES_CONTACT: [
            NotificationType.TASK_CONFIRMED.value,
        ],
        UserRole.TEAM_LEADER: [
            NotificationType.TASK_DISPATCHED.value,
            NotificationType.WORK_ORDER_ACCEPTED.value,
            NotificationType.VISIT_LOG_CREATED.value,
            NotificationType.LEAD_CREATED.value,
        ],
        UserRole.MEMBER: [
            NotificationType.WORK_ORDER_ASSIGNED.value,
            NotificationType.REVIEW_CREATED.value,
            NotificationType.COLLABORATIVE_MEMBER_ADDED.value,
        ],
    }
    
    # 所有用户都能看到的通知类型
    common_types = [
        NotificationType.USER_APPROVED.value,
        NotificationType.USER_REJECTED.value,
    ]
    
    # 返回该角色相关的通知类型
    role_types = role_notification_map.get(role, [])
    return role_types + common_types


@router.get("", response_model=PaginatedResponse[NotificationResponse])
def get_notifications(
    is_read: Optional[bool] = Query(None, description="是否已读筛选"),
    notification_type: Optional[NotificationType] = Query(None, description="通知类型筛选"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """获取当前用户的通知列表（基于当前激活角色过滤）"""
    current_user, current_role = user_role
    
    # 获取当前角色相关的通知类型
    allowed_types = get_notification_types_for_role(current_role.role)
    
    # 基础查询：用户ID匹配且通知类型在当前角色允许的类型列表中
    query = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.notification_type.in_(allowed_types)
    )
    
    # 筛选条件
    if is_read is not None:
        query = query.filter(Notification.is_read == is_read)
    if notification_type:
        # 将枚举值转换为字符串进行比较
        query = query.filter(Notification.notification_type == notification_type.value if isinstance(notification_type, NotificationType) else str(notification_type))
    
    # 获取总数
    total = query.count()
    
    # 分页
    skip = (page - 1) * page_size
    notifications = query.order_by(Notification.created_at.desc()).offset(skip).limit(page_size).all()
    
    return PaginatedResponse.create(
        [NotificationResponse.from_orm(n) for n in notifications],
        total,
        page,
        page_size
    )


@router.get("/unread-count", response_model=dict)
def get_unread_count(
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """获取未读通知数量（基于当前激活角色过滤）"""
    current_user, current_role = user_role
    
    # 获取当前角色相关的通知类型
    allowed_types = get_notification_types_for_role(current_role.role)
    
    count = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.notification_type.in_(allowed_types),
        Notification.is_read == False
    ).count()
    
    return {"unread_count": count}


@router.get("/{notification_id}", response_model=NotificationResponse)
def get_notification(
    notification_id: int,
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """获取通知详情（基于当前激活角色权限）"""
    current_user, current_role = user_role
    
    # 获取当前角色相关的通知类型
    allowed_types = get_notification_types_for_role(current_role.role)
    
    notification = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id,
        Notification.notification_type.in_(allowed_types)
    ).first()
    
    if not notification:
        raise HTTPException(status_code=404, detail="通知不存在")
    
    return NotificationResponse.from_orm(notification)


@router.put("/{notification_id}/read", response_model=NotificationResponse)
def mark_as_read(
    notification_id: int,
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """标记通知为已读（基于当前激活角色权限）"""
    current_user, current_role = user_role
    
    # 获取当前角色相关的通知类型
    allowed_types = get_notification_types_for_role(current_role.role)
    
    notification = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id,
        Notification.notification_type.in_(allowed_types)
    ).first()
    
    if not notification:
        raise HTTPException(status_code=404, detail="通知不存在")
    
    if not notification.is_read:
        notification.is_read = True
        notification.read_at = datetime.utcnow()
        db.commit()
        db.refresh(notification)
    
    return NotificationResponse.from_orm(notification)


@router.put("/read-all", response_model=dict)
def mark_all_as_read(
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """标记所有通知为已读（基于当前激活角色）"""
    current_user, current_role = user_role
    
    # 获取当前角色相关的通知类型
    allowed_types = get_notification_types_for_role(current_role.role)
    
    count = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.notification_type.in_(allowed_types),
        Notification.is_read == False
    ).update({
        Notification.is_read: True,
        Notification.read_at: datetime.utcnow()
    })
    db.commit()
    
    return {"message": f"已标记 {count} 条通知为已读", "count": count}


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_notification(
    notification_id: int,
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """删除通知（基于当前激活角色权限）"""
    current_user, current_role = user_role
    
    # 获取当前角色相关的通知类型
    allowed_types = get_notification_types_for_role(current_role.role)
    
    notification = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id,
        Notification.notification_type.in_(allowed_types)
    ).first()
    
    if not notification:
        raise HTTPException(status_code=404, detail="通知不存在")
    
    db.delete(notification)
    db.commit()
    
    return None


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_all_notifications(
    is_read: Optional[bool] = Query(None, description="是否只删除已读通知"),
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """删除所有通知（或所有已读通知，基于当前激活角色）"""
    current_user, current_role = user_role
    
    # 获取当前角色相关的通知类型
    allowed_types = get_notification_types_for_role(current_role.role)
    
    query = db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.notification_type.in_(allowed_types)
    )
    
    if is_read is not None:
        query = query.filter(Notification.is_read == is_read)
    
    count = query.delete()
    db.commit()
    
    return None

