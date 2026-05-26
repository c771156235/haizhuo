"""
任务模型
"""
from sqlalchemy import Column, Integer, String, Text, Enum, DateTime, ForeignKey, Date
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.database import Base


class TaskStatus(str, enum.Enum):
    """任务状态枚举"""
    DRAFT = "draft"                  # 草稿
    PENDING = "pending"              # 待确认
    REJECTED = "rejected"            # 已拒绝
    CONFIRMED = "confirmed"          # 已确认
    DETAIL_REQUIRED = "detail_required"  # 待填写详细需求
    DETAIL_SUBMITTED = "detail_submitted"  # 详细需求已提交
    DISPATCHED = "dispatched"        # 已派单
    IN_PROGRESS = "in_progress"      # 进行中
    COMPLETED = "completed"          # 已完成
    CANCELLED = "cancelled"          # 已关闭


class Task(Base):
    """任务表"""
    __tablename__ = "tasks"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    task_name = Column(String(200), nullable=False, comment="任务名称")
    sales_unit = Column(Text, nullable=False, comment="面向的销售单位（多个值用逗号分隔）")
    start_date = Column(Date, nullable=False, comment="任务开始日期")
    end_date = Column(Date, nullable=False, comment="任务结束日期")
    fde_count = Column(Integer, nullable=False, comment="FDE支撑人员数量")
    
    # 详细需求单信息
    customer_unit = Column(String(200), nullable=True, comment="客户单位")
    industry_type = Column(String(100), nullable=True, comment="行业类型")
    requirement_content = Column(Text, nullable=True, comment="详细需求内容（拜访线索单内容）")
    expected_visit_time = Column(DateTime(timezone=True), nullable=True, comment="预期拜访时间")
    
    # 状态和流程
    # 使用 Enum 类型，显式指定所有枚举值以确保 SQLAlchemy 正确映射
    status = Column(
        Enum(
            TaskStatus,
            values_callable=lambda obj: [e.value for e in obj]
        ),
        default=TaskStatus.DRAFT,
        comment="任务状态"
    )
    rejection_reason = Column(Text, nullable=True, comment="拒绝原因")
    
    # 关联用户
    initiator_id = Column(Integer, ForeignKey("users.id"), nullable=False, comment="发起人ID")
    initiator_role = Column(String(50), nullable=True, comment="任务创建时发起人使用的角色（task_initiator或sales_contact）")
    manager_id = Column(Integer, ForeignKey("users.id"), nullable=True, comment="总管ID")
    sales_contact_id = Column(Integer, ForeignKey("users.id"), nullable=True, comment="销售接口人ID")
    
    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment="创建时间")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), comment="更新时间")
    confirmed_at = Column(DateTime(timezone=True), nullable=True, comment="确认时间")
    detail_submitted_at = Column(DateTime(timezone=True), nullable=True, comment="详细需求提交时间")
    
    # 关系
    initiator = relationship("User", foreign_keys=[initiator_id], back_populates="initiated_tasks")
    manager = relationship("User", foreign_keys=[manager_id], back_populates="managed_tasks")
    sales_contact = relationship("User", foreign_keys=[sales_contact_id], back_populates="sales_contact_tasks")
    work_orders = relationship("WorkOrder", back_populates="task", cascade="all, delete-orphan")
    opportunities = relationship("Opportunity", back_populates="task")
    detail_requirements = relationship("TaskDetailRequirement", back_populates="task", cascade="all, delete-orphan")
    leads = relationship("Lead", back_populates="task", cascade="all, delete-orphan")


class TaskDetailRequirement(Base):
    """任务详细需求表（支持一个任务多个客户）"""
    __tablename__ = "task_detail_requirements"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False, comment="任务ID")
    
    # 详细需求单信息
    customer_unit = Column(String(200), nullable=False, comment="客户单位")
    industry_type = Column(String(100), nullable=False, comment="行业类型")
    customer_source = Column(String(200), nullable=True, comment="客户来源（部门信息，如：销售单位 - 东区、云能力中心等）")
    requirement_content = Column(Text, nullable=False, comment="详细需求内容（拜访线索单内容）")
    expected_visit_time = Column(DateTime(timezone=True), nullable=True, comment="预期拜访时间")
    
    # 专项任务发起人创建的任务需要额外字段（必填）
    customer_visit_address = Column(String(500), nullable=True, comment="客户拜访地址")
    customer_manager_name = Column(String(100), nullable=True, comment="客户经理姓名")
    customer_manager_contact = Column(String(100), nullable=True, comment="客户经理联系方式")
    
    # 关联用户
    sales_contact_id = Column(Integer, ForeignKey("users.id"), nullable=False, comment="提交的销售接口人ID")
    
    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment="创建时间")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), comment="更新时间")
    
    # 关系
    task = relationship("Task", back_populates="detail_requirements")
    sales_contact = relationship("User", foreign_keys=[sales_contact_id])
    work_orders = relationship("WorkOrder", back_populates="detail_requirement", cascade="all, delete-orphan")

