"""
线索模型
"""
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Lead(Base):
    """线索表"""
    __tablename__ = "leads"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # 关联拜访日志
    visit_log_id = Column(Integer, ForeignKey("visit_logs.id"), nullable=False, comment="拜访日志ID")
    
    # 关联任务（通过拜访日志获取）
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False, comment="所属任务ID")
    
    # 关联成员（创建线索的成员）
    member_id = Column(Integer, ForeignKey("users.id"), nullable=False, comment="成员ID")
    
    # 线索信息
    customer_name = Column(String(200), nullable=False, comment="客户名称")
    requirement_direction = Column(Text, nullable=False, comment="客户需求方向（JSON数组格式，支持多选）")
    detail_description = Column(Text, nullable=False, comment="详细需求描述")
    
    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment="创建时间")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), comment="更新时间")
    
    # 关系
    visit_log = relationship("VisitLog", back_populates="leads")
    task = relationship("Task", back_populates="leads")
    member = relationship("User", back_populates="leads")
    opportunity = relationship("Opportunity", back_populates="lead", uselist=False, cascade="all, delete-orphan")

