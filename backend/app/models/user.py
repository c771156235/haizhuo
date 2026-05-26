"""
用户模型
"""
from sqlalchemy import Column, Integer, String, Enum, DateTime, Boolean, ForeignKey, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.database import Base


class UserRole(str, enum.Enum):
    """用户角色枚举"""
    TASK_INITIATOR = "task_initiator"  # 专项任务发起人
    MANAGER = "manager"                # 总管
    SALES_CONTACT = "sales_contact"    # 销售单位接口人
    TEAM_LEADER = "team_leader"        # 组长
    MEMBER = "member"                  # 成员


# 角色枚举对应的中文标签（用于操作日志等展示，与前端 UserRoleLabels 一致）
USER_ROLE_LABELS = {
    UserRole.TASK_INITIATOR: "专项任务发起人",
    UserRole.MANAGER: "总管",
    UserRole.SALES_CONTACT: "销售单位接口人",
    UserRole.TEAM_LEADER: "组长",
    UserRole.MEMBER: "成员",
}


class ApprovalStatus(str, enum.Enum):
    """用户审核状态枚举"""
    PENDING = "pending"      # 待审核
    APPROVED = "approved"    # 已通过
    REJECTED = "rejected"    # 已拒绝


class User(Base):
    """用户表（基础信息）"""
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    username = Column(String(50), unique=True, index=True, nullable=False, comment="用户名")
    password_hash = Column(String(255), nullable=False, comment="密码哈希")
    real_name = Column(String(50), nullable=False, comment="真实姓名")
    email = Column(String(100), nullable=True, comment="邮箱")
    phone = Column(String(20), nullable=True, comment="手机号")
    avatar = Column(String(255), nullable=True, comment="头像URL")
    is_active = Column(Boolean, default=True, comment="是否激活")
    failed_login_attempts = Column(Integer, default=0, comment="登录失败次数")
    locked_until = Column(DateTime(timezone=True), nullable=True, comment="账户锁定到期时间")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment="创建时间")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), comment="更新时间")
    
    # 保留role字段用于向后兼容（逐步迁移期间使用）
    # 注意：新系统应该使用user_roles关系来获取角色
    role = Column(Enum(UserRole), nullable=True, comment="角色（已废弃，保留用于兼容）")
    sales_unit = Column(String(100), nullable=True, comment="所属销售单位（已废弃，保留用于兼容）")
    approval_status = Column(String(20), nullable=True, comment="审核状态（已废弃，保留用于兼容）")
    rejection_reason = Column(String(500), nullable=True, comment="拒绝原因（已废弃，保留用于兼容）")
    approved_at = Column(DateTime(timezone=True), nullable=True, comment="审核通过时间（已废弃，保留用于兼容）")
    approved_by = Column(Integer, nullable=True, comment="审核人ID（已废弃，保留用于兼容）")
    
    # 关系
    user_roles = relationship("UserRoleAssociation", back_populates="user", cascade="all, delete-orphan")
    initiated_tasks = relationship("Task", foreign_keys="Task.initiator_id", back_populates="initiator")
    managed_tasks = relationship("Task", foreign_keys="Task.manager_id", back_populates="manager")
    sales_contact_tasks = relationship("Task", foreign_keys="Task.sales_contact_id", back_populates="sales_contact")
    assigned_work_orders = relationship("WorkOrder", foreign_keys="WorkOrder.member_id", back_populates="member")
    team_leader_work_orders = relationship("WorkOrder", foreign_keys="WorkOrder.team_leader_id", back_populates="team_leader")
    visit_logs = relationship("VisitLog", back_populates="member")
    reviews = relationship("Review", back_populates="team_leader")
    opportunities = relationship("Opportunity", back_populates="team_leader")
    leads = relationship("Lead", back_populates="member")
    audit_logs = relationship("AuditLog", back_populates="user")
    notifications = relationship("Notification", back_populates="user")


class UserRoleAssociation(Base):
    """用户角色关联表"""
    __tablename__ = "user_roles"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, comment="用户ID")
    role = Column(Enum(UserRole), nullable=False, comment="角色")
    sales_unit = Column(String(100), nullable=True, comment="所属销售单位")
    is_current = Column(Boolean, default=False, comment="是否为当前激活的角色")
    is_active = Column(Boolean, default=True, comment="该角色身份是否激活")
    approval_status = Column(String(20), default=ApprovalStatus.PENDING.value, comment="审核状态")
    rejection_reason = Column(String(500), nullable=True, comment="拒绝原因")
    approved_at = Column(DateTime(timezone=True), nullable=True, comment="审核通过时间")
    approved_by = Column(Integer, nullable=True, comment="审核人ID")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment="创建时间")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), comment="更新时间")
    
    # 关系
    user = relationship("User", back_populates="user_roles")
    
    # 唯一约束：同一用户不能有重复的角色（但可以有不同的销售单位）
    # 注意：如果需要同一用户同一角色但不同销售单位，可以移除这个唯一约束
    __table_args__ = (
        Index('idx_user_role', 'user_id', 'role', unique=True),
    )

