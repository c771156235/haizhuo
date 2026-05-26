"""
通知模型
"""
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.database import Base


class NotificationType(str, enum.Enum):
    """通知类型枚举"""
    TASK_PENDING = "task_pending"                  # 待确认任务
    TASK_CONFIRMED = "task_confirmed"              # 任务已确认
    TASK_REJECTED = "task_rejected"                 # 任务已拒绝
    TASK_DETAIL_SUBMITTED = "task_detail_submitted"  # 详细需求已提交
    TASK_DISPATCHED = "task_dispatched"            # 任务已派单
    WORK_ORDER_ASSIGNED = "work_order_assigned"    # 工单已分配
    WORK_ORDER_ACCEPTED = "work_order_accepted"    # 工单已接单
    WORK_ORDER_COMPLETED = "work_order_completed"  # 工单已拜访
    WORK_ORDER_CANCELLED = "work_order_cancelled"  # 工单已取消
    VISIT_LOG_CREATED = "visit_log_created"        # 拜访日志已创建
    REVIEW_CREATED = "review_created"               # 复盘已创建
    OPPORTUNITY_CREATED = "opportunity_created"     # 商机已创建
    OPPORTUNITY_STATUS_CHANGED = "opportunity_status_changed"  # 商机状态已变更
    LEAD_CREATED = "lead_created"                   # 线索已创建
    COLLABORATIVE_MEMBER_ADDED = "collaborative_member_added"  # 协同人员已添加
    USER_REGISTRATION_PENDING = "user_registration_pending"    # 用户注册待审核
    USER_APPROVED = "user_approved"                # 用户审核通过
    USER_REJECTED = "user_rejected"                 # 用户审核拒绝


class Notification(Base):
    """通知表"""
    __tablename__ = "notifications"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # 接收用户
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True, comment="接收用户ID")
    
    # 通知类型
    # 使用 String 类型存储枚举值，避免 MySQL ENUM 类型与代码枚举值不匹配的问题
    # 在应用层通过 NotificationType 枚举进行验证
    notification_type = Column(String(50), nullable=False, comment="通知类型")
    
    # 通知内容
    title = Column(String(200), nullable=False, comment="通知标题")
    content = Column(Text, nullable=True, comment="通知内容")
    
    # 关联资源（可选）
    resource_type = Column(String(50), nullable=True, comment="关联资源类型（task/work_order/opportunity等）")
    resource_id = Column(Integer, nullable=True, index=True, comment="关联资源ID")
    
    # 是否已读
    is_read = Column(Boolean, default=False, index=True, comment="是否已读")
    
    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True, comment="创建时间")
    read_at = Column(DateTime(timezone=True), nullable=True, comment="已读时间")
    
    # 关系
    user = relationship("User", back_populates="notifications")

