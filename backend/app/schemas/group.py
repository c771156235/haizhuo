"""
组相关的 Pydantic 模式
"""
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class GroupMemberInfo(BaseModel):
    """组成员信息"""
    id: int
    username: str
    real_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    
    class Config:
        from_attributes = True


class GroupBase(BaseModel):
    """组基础模式"""
    name: str
    description: Optional[str] = None


class GroupCreate(GroupBase):
    """创建组模式"""
    leader_ids: Optional[List[int]] = []  # 组长ID列表（支持多个组长）
    member_ids: Optional[List[int]] = []


class GroupUpdate(BaseModel):
    """更新组模式"""
    name: Optional[str] = None
    description: Optional[str] = None
    leader_ids: Optional[List[int]] = None  # 组长ID列表（支持多个组长）


class GroupResponse(GroupBase):
    """组响应模式"""
    id: int
    leader_id: Optional[int] = None  # 主组长ID（向后兼容）
    leader_name: Optional[str] = None  # 主组长名称（向后兼容）
    leader_ids: Optional[List[int]] = []  # 所有组长ID列表
    leader_names: Optional[List[str]] = []  # 所有组长名称列表
    member_count: int = 0
    members: List[GroupMemberInfo] = []
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True
    
    @classmethod
    def from_orm_with_relations(cls, group):
        """从ORM对象创建响应对象，包含关联数据"""
        from app.models.group import group_members
        from app.models.user import User
        
        # 获取主组长信息（向后兼容）
        leader_name = None
        if group.leader:
            leader_name = group.leader.real_name or group.leader.username
        
        # 获取所有组长信息
        leader_ids = []
        leader_names = []
        if hasattr(group, 'leaders') and group.leaders:
            for leader in group.leaders:
                leader_ids.append(leader.id)
                leader_names.append(leader.real_name or leader.username)
        
        # 如果没有组长列表但有主组长，将主组长添加到列表（向后兼容）
        if not leader_ids and group.leader_id:
            leader_ids.append(group.leader_id)
            if leader_name:
                leader_names.append(leader_name)
        
        # 获取成员列表
        members = []
        if hasattr(group, 'members'):
            for member in group.members:
                members.append(GroupMemberInfo(
                    id=member.id,
                    username=member.username,
                    real_name=member.real_name,
                    email=member.email,
                    phone=member.phone
                ))
        
        return cls(
            id=group.id,
            name=group.name,
            description=group.description,
            leader_id=group.leader_id,  # 保留主组长ID（向后兼容）
            leader_name=leader_name,  # 保留主组长名称（向后兼容）
            leader_ids=leader_ids,  # 所有组长ID列表
            leader_names=leader_names,  # 所有组长名称列表
            member_count=len(members),
            members=members,
            created_at=group.created_at,
            updated_at=group.updated_at
        )


class GroupMemberAdd(BaseModel):
    """添加组成员模式"""
    user_ids: List[int]


class GroupMemberRemove(BaseModel):
    """移除组成员模式"""
    user_ids: List[int]

