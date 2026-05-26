"""
选项配置 Schema
"""
from typing import Optional, List
from pydantic import BaseModel, Field
from datetime import datetime
from app.models.option_config import OptionType


class OptionConfigBase(BaseModel):
    """选项配置基础 Schema"""
    option_type: OptionType = Field(..., description="选项类型")
    value: str = Field(..., max_length=200, description="选项值")
    label: str = Field(..., max_length=200, description="选项标签")
    parent_id: Optional[int] = Field(None, description="父选项ID")
    sort_order: int = Field(0, description="排序顺序")
    is_active: bool = Field(True, description="是否启用")
    description: Optional[str] = Field(None, description="选项描述")


class OptionConfigCreate(OptionConfigBase):
    """创建选项配置 Schema"""
    pass


class OptionConfigUpdate(BaseModel):
    """更新选项配置 Schema"""
    value: Optional[str] = Field(None, max_length=200, description="选项值")
    label: Optional[str] = Field(None, max_length=200, description="选项标签")
    parent_id: Optional[int] = Field(None, description="父选项ID")
    sort_order: Optional[int] = Field(None, description="排序顺序")
    is_active: Optional[bool] = Field(None, description="是否启用")
    description: Optional[str] = Field(None, description="选项描述")


class OptionConfigResponse(OptionConfigBase):
    """选项配置响应 Schema"""
    id: int
    level: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class OptionConfigTree(OptionConfigResponse):
    """选项配置树形结构 Schema"""
    children: Optional[List['OptionConfigTree']] = None


# 允许递归引用
OptionConfigTree.model_rebuild()


class OptionConfigListResponse(BaseModel):
    """选项配置列表响应（树形结构）"""
    items: List[OptionConfigTree]


class MemberMenuVisibilityItem(BaseModel):
    """成员菜单可见性项"""
    menu_key: str = Field(..., description="菜单路径key")
    label: str = Field(..., description="菜单名称")
    is_visible: bool = Field(..., description="成员是否可见")


class MemberMenuVisibilityListResponse(BaseModel):
    """成员菜单可见性列表响应"""
    items: List[MemberMenuVisibilityItem]


class MemberMenuVisibilityUpdate(BaseModel):
    """更新成员菜单可见性请求"""
    menu_key: str = Field(..., description="菜单路径key")
    is_visible: bool = Field(..., description="是否显示给成员")

