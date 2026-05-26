"""
线索相关的 Pydantic 模式
"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from sqlalchemy.orm import Session


class LeadBase(BaseModel):
    """线索基础模式"""
    visit_log_id: int
    customer_name: str
    requirement_direction: str
    detail_description: str


class LeadCreate(LeadBase):
    """创建线索模式"""
    task_id: int  # 任务ID（从拜访日志获取，用于验证）


class LeadUpdate(BaseModel):
    """更新线索模式"""
    customer_name: Optional[str] = None
    requirement_direction: Optional[str] = None
    detail_description: Optional[str] = None


class LeadInDB(LeadBase):
    """数据库中的线索模式"""
    id: int
    visit_log_id: int
    task_id: int  # 任务ID（从拜访日志获取）
    member_id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class LeadResponse(LeadInDB):
    """线索响应模式（包含关联信息）"""
    # 任务信息
    task_name: Optional[str] = None
    task_sales_unit: Optional[str] = None
    
    # 成员信息
    member_name: Optional[str] = None
    member_username: Optional[str] = None
    
    # 工单信息（用于创建商机时确定team_leader_id）
    work_order_team_leader_id: Optional[int] = None  # 工单的组长ID
    
    # 商机信息（用于判断是否已转换为商机）
    has_opportunity: bool = False  # 是否已转换为商机
    opportunity_id: Optional[int] = None  # 关联的商机ID
    
    @classmethod
    def from_orm_with_relations(cls, lead, db: Optional[Session] = None):
        """从ORM对象创建响应，包含关联信息"""
        from app.utils.requirement_direction_utils import convert_requirement_direction_value_to_label
        
        # 转换requirement_direction：将value转换为label
        requirement_direction_display = lead.requirement_direction
        if db and lead.requirement_direction:
            requirement_direction_display = convert_requirement_direction_value_to_label(
                db, lead.requirement_direction
            )
        
        data = {
            "id": lead.id,
            "visit_log_id": lead.visit_log_id,
            "task_id": lead.task_id,
            "member_id": lead.member_id,
            "customer_name": lead.customer_name,
            "requirement_direction": requirement_direction_display,
            "detail_description": lead.detail_description,
            "created_at": lead.created_at,
            "updated_at": lead.updated_at,
        }
        
        # 填充任务信息
        if lead.task:
            data["task_name"] = lead.task.task_name
            data["task_sales_unit"] = lead.task.sales_unit
        
        # 填充成员信息
        if lead.member:
            data["member_name"] = lead.member.real_name
            data["member_username"] = lead.member.username
        
        # 填充工单信息（用于创建商机时确定team_leader_id）
        if lead.visit_log and lead.visit_log.work_order:
            data["work_order_team_leader_id"] = lead.visit_log.work_order.team_leader_id
        else:
            data["work_order_team_leader_id"] = None
        
        # 检查是否已转换为商机
        if lead.opportunity:
            data["has_opportunity"] = True
            data["opportunity_id"] = lead.opportunity.id
        else:
            data["has_opportunity"] = False
            data["opportunity_id"] = None
        
        return cls(**data)

