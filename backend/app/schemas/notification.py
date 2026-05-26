"""
通知相关的 Pydantic 模式
"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from app.models.notification import NotificationType


class NotificationBase(BaseModel):
    """通知基础模式"""
    notification_type: NotificationType
    title: str
    content: Optional[str] = None
    resource_type: Optional[str] = None
    resource_id: Optional[int] = None


class NotificationCreate(NotificationBase):
    """创建通知模式"""
    user_id: int


class NotificationResponse(NotificationBase):
    """通知响应模式"""
    id: int
    user_id: int
    is_read: bool
    created_at: datetime
    read_at: Optional[datetime] = None
    
    @classmethod
    def from_orm(cls, obj):
        """从 ORM 对象创建响应对象，处理 notification_type 的转换"""
        # 如果 notification_type 是字符串，转换为枚举类型
        notification_type_value = obj.notification_type
        if isinstance(notification_type_value, str):
            try:
                notification_type_value = NotificationType(notification_type_value)
            except ValueError:
                # 如果无法转换为枚举，保持原值（字符串）
                pass
        
        data = {
            'id': obj.id,
            'user_id': obj.user_id,
            'notification_type': notification_type_value,
            'title': obj.title,
            'content': obj.content,
            'resource_type': obj.resource_type,
            'resource_id': obj.resource_id,
            'is_read': obj.is_read,
            'created_at': obj.created_at,
            'read_at': obj.read_at
        }
        return cls(**data)
    
    class Config:
        from_attributes = True


class NotificationUpdate(BaseModel):
    """更新通知模式"""
    is_read: Optional[bool] = None


class NotificationListParams(BaseModel):
    """通知列表查询参数"""
    is_read: Optional[bool] = None
    notification_type: Optional[NotificationType] = None
    page: int = 1
    page_size: int = 20

