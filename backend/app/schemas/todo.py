"""
待办事项相关的 Pydantic 模式
"""
from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime, date


class TodoItem(BaseModel):
    """待办事项项"""
    id: int
    type: Literal["task", "work_order", "opportunity", "user"]
    priority: Literal["high", "medium", "low"]
    title: str
    description: Optional[str] = None
    due_date: Optional[date] = None
    is_overdue: bool
    link: str
    action_type: Optional[Literal["assign", "accept", "confirm", "submit", "waiting", "approve"]] = None
    sales_unit: Optional[str] = None  # 销售单位
    resource_id: int  # 关联的资源ID（任务ID、工单ID、商机ID或用户ID）
    
    class Config:
        from_attributes = True


class TodoStatistics(BaseModel):
    """待办事项统计"""
    total: int
    overdue: int
    high_priority: int
    by_type: dict[str, int]  # 按类型统计
    by_action_type: dict[str, int]  # 按操作类型统计


class TodoListResponse(BaseModel):
    """待办事项列表响应"""
    items: list[TodoItem]
    statistics: TodoStatistics
    total: int

