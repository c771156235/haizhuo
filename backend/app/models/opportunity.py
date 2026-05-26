"""
商机模型
"""
from sqlalchemy import Column, Integer, String, Text, Enum, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.database import Base


class OpportunityStatus(str, enum.Enum):
    """商机状态枚举"""
    CREATED = "created"      # 已创建
    IN_PROGRESS = "in_progress"  # 进行中
    LOST = "lost"           # 流失
    WON = "won"             # 转定（成功）


class Opportunity(Base):
    """商机表"""
    __tablename__ = "opportunities"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    opportunity_no = Column(String(50), unique=True, index=True, nullable=False, comment="商机编号")
    
    # 关联线索（商机必须从线索创建）
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=False, unique=True, comment="关联线索ID")
    
    # 关联任务（从线索获取）
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False, comment="所属任务ID")
    
    # 关联组长
    team_leader_id = Column(Integer, ForeignKey("users.id"), nullable=False, comment="组长ID")
    
    # 商机信息
    customer_unit = Column(String(200), nullable=False, comment="客户单位")
    required_products = Column(Text, nullable=True, comment="客户需要的产品")
    description = Column(Text, nullable=True, comment="商机描述")
    expected_amount = Column(String(50), nullable=True, comment="预计金额")
    
    # 状态
    status = Column(Enum(OpportunityStatus), default=OpportunityStatus.CREATED, comment="商机状态")
    
    # 流失/转定信息
    lost_reason = Column(Text, nullable=True, comment="流失原因")
    won_amount = Column(String(50), nullable=True, comment="转定金额")
    
    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment="创建时间")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), comment="更新时间")
    status_changed_at = Column(DateTime(timezone=True), nullable=True, comment="状态变更时间")
    
    # 关系
    lead = relationship("Lead", back_populates="opportunity", uselist=False)
    task = relationship("Task", back_populates="opportunities")
    team_leader = relationship("User", back_populates="opportunities")
    collaborative_members = relationship("CollaborativeMember", back_populates="opportunity", cascade="all, delete-orphan")


class CollaborativeMember(Base):
    """阶段性协同人员表"""
    __tablename__ = "collaborative_members"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # 关联商机
    opportunity_id = Column(Integer, ForeignKey("opportunities.id"), nullable=False, comment="商机ID")
    
    # 关联成员
    member_id = Column(Integer, ForeignKey("users.id"), nullable=False, comment="成员ID")
    
    # 协同信息
    role = Column(String(100), nullable=True, comment="协同角色")
    description = Column(Text, nullable=True, comment="协同说明")
    
    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment="创建时间")
    
    # 关系
    opportunity = relationship("Opportunity", back_populates="collaborative_members")
    member = relationship("User")

