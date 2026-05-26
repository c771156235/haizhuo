"""
工单模型
"""
from sqlalchemy import Column, Integer, String, Text, Enum, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.database import Base


class WorkOrderStatus(str, enum.Enum):
    """工单状态枚举"""
    PENDING_GROUP_CLAIM = "pending_group_claim"  # 待组内认领（派单至组，任一组长认领后转派）
    PENDING_ASSIGN = "pending_assign"  # 待转派（组长还未转派给成员）
    PENDING_ACCEPT = "pending_accept"  # 待接单（已转派，等待成员接单）
    ACCEPTED = "accepted"              # 已接单
    IN_PROGRESS = "in_progress"        # 历史兼容；新流程创建拜访日志后不再进入该状态
    COMPLETED = "completed"            # 已拜访
    CANCELLED = "cancelled"            # 已取消
    # 兼容旧数据（已废弃，请运行迁移脚本 migrate_work_order_status.py）
    PENDING = "pending"                # 已废弃：请迁移为 pending_assign 或 pending_accept


class WorkOrder(Base):
    """工单表"""
    __tablename__ = "work_orders"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    work_order_no = Column(String(50), unique=True, index=True, nullable=False, comment="工单编号")
    
    # 关联任务
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False, comment="所属任务ID")
    
    # 关联详细需求（新增：工单关联到具体的客户需求）
    detail_requirement_id = Column(Integer, ForeignKey("task_detail_requirements.id"), nullable=True, comment="关联的详细需求ID")

    # 派单目标组（待认领工单必填；认领后仍保留便于统计口径）
    dispatch_group_id = Column(Integer, ForeignKey("groups.id"), nullable=True, comment="派单目标FDE组ID")
    
    # 关联用户（待组内认领时为空，认领后写入组长）
    team_leader_id = Column(Integer, ForeignKey("users.id"), nullable=True, comment="组长ID")
    member_id = Column(Integer, ForeignKey("users.id"), nullable=True, comment="成员ID")

    dispatch_group = relationship("Group", foreign_keys=[dispatch_group_id])
    
    # 状态
    # 使用 String 类型存储，避免 MySQL ENUM 类型映射问题
    # 枚举值验证在应用层进行（通过 Pydantic schema）
    status = Column(
        String(20),
        default=WorkOrderStatus.PENDING_ASSIGN.value,
        comment="工单状态"
    )
    
    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment="创建时间")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), comment="更新时间")
    accepted_at = Column(DateTime(timezone=True), nullable=True, comment="接单时间")
    completed_at = Column(DateTime(timezone=True), nullable=True, comment="完成时间")
    cancelled_at = Column(DateTime(timezone=True), nullable=True, comment="取消时间")
    
    # 取消原因
    cancellation_reason = Column(Text, nullable=True, comment="取消原因")
    
    # 关系
    task = relationship("Task", back_populates="work_orders")
    detail_requirement = relationship("TaskDetailRequirement", back_populates="work_orders")
    team_leader = relationship("User", foreign_keys=[team_leader_id], back_populates="team_leader_work_orders")
    member = relationship("User", foreign_keys=[member_id], back_populates="assigned_work_orders")
    visit_logs = relationship("VisitLog", back_populates="work_order", cascade="all, delete-orphan")

