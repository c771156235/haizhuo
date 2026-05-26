"""
复盘模型
"""
from sqlalchemy import Column, Integer, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Review(Base):
    """复盘表"""
    __tablename__ = "reviews"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # 关联拜访日志
    visit_log_id = Column(Integer, ForeignKey("visit_logs.id"), unique=True, nullable=False, comment="拜访日志ID")
    
    # 关联组长
    team_leader_id = Column(Integer, ForeignKey("users.id"), nullable=False, comment="组长ID")
    
    # 复盘内容
    comment = Column(Text, nullable=True, comment="批注内容")
    review_summary = Column(Text, nullable=True, comment="复盘总结")
    
    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment="创建时间")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), comment="更新时间")
    
    # 关系
    visit_log = relationship("VisitLog", back_populates="review")
    team_leader = relationship("User", back_populates="reviews")

