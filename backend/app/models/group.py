"""
组模型
"""
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Table, Index
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base

# 组成员关联表（多对多关系）
group_members = Table(
    'group_members',
    Base.metadata,
    Column('group_id', Integer, ForeignKey('groups.id', ondelete='CASCADE'), primary_key=True, comment="组ID"),
    Column('user_id', Integer, ForeignKey('users.id', ondelete='CASCADE'), primary_key=True, comment="用户ID"),
    Column('created_at', DateTime(timezone=True), server_default=func.now(), comment="加入时间"),
    Index('idx_group_member', 'group_id', 'user_id', unique=True)
)

# 组组长关联表（一对一关系：每个组长只能属于一个组）
group_leaders = Table(
    'group_leaders',
    Base.metadata,
    Column('group_id', Integer, ForeignKey('groups.id', ondelete='CASCADE'), primary_key=True, comment="组ID"),
    Column('user_id', Integer, ForeignKey('users.id', ondelete='CASCADE'), primary_key=True, comment="组长ID"),
    Column('created_at', DateTime(timezone=True), server_default=func.now(), comment="成为组长时间"),
    Index('idx_group_leader', 'group_id', 'user_id', unique=True),
    Index('idx_group_leaders_user_id_unique', 'user_id', unique=True)  # 确保每个用户只能在一个组中担任组长
)


class Group(Base):
    """组表"""
    __tablename__ = "groups"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    name = Column(String(100), nullable=False, comment="组名")
    leader_id = Column(Integer, ForeignKey("users.id"), nullable=True, comment="组长ID")
    description = Column(String(500), nullable=True, comment="组描述")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment="创建时间")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), comment="更新时间")
    
    # 关系
    leader = relationship("User", foreign_keys=[leader_id], backref="led_groups")  # 主组长（向后兼容）
    leaders = relationship("User", secondary=group_leaders, backref="leader_groups", lazy="select")  # 所有组长（多对多）
    members = relationship("User", secondary=group_members, backref="groups", lazy="select")

