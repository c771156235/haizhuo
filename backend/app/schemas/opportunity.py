"""
商机相关的 Pydantic 模式
"""
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from app.models.opportunity import OpportunityStatus


class CollaborativeMemberBase(BaseModel):
    """协同人员基础模式"""
    member_id: int
    role: Optional[str] = None
    description: Optional[str] = None


class CollaborativeMemberCreate(CollaborativeMemberBase):
    """创建协同人员模式（opportunity_id在URL路径中提供，不需要在请求体中）"""
    pass


class CollaborativeMemberResponse(CollaborativeMemberBase):
    """协同人员响应模式（包含关联信息）"""
    id: int
    opportunity_id: int
    created_at: datetime
    # 成员信息
    member_name: Optional[str] = None
    member_username: Optional[str] = None
    
    @classmethod
    def from_orm_with_relations(cls, member):
        """从ORM对象创建响应，包含关联信息"""
        data = {
            "id": member.id,
            "opportunity_id": member.opportunity_id,
            "member_id": member.member_id,
            "role": member.role,
            "description": member.description,
            "created_at": member.created_at,
        }
        
        # 填充成员信息
        if member.member:
            data["member_name"] = member.member.real_name
            data["member_username"] = member.member.username
        
        return cls(**data)
    
    class Config:
        from_attributes = True


class OpportunityBase(BaseModel):
    """商机基础模式"""
    opportunity_no: str
    lead_id: int  # 关联线索ID（商机必须从线索创建）
    task_id: int
    customer_unit: str
    required_products: str  # 具体产品（必填）
    description: str  # 商机描述（必填）
    expected_amount: Optional[str] = None  # 预计金额（可选）


class OpportunityCreate(OpportunityBase):
    """创建商机模式（从线索转换）"""
    team_leader_id: int


class OpportunityUpdate(BaseModel):
    """更新商机模式"""
    customer_unit: Optional[str] = None
    required_products: Optional[str] = None
    description: Optional[str] = None
    expected_amount: Optional[str] = None
    status: Optional[OpportunityStatus] = None
    lost_reason: Optional[str] = None
    won_amount: Optional[str] = None


class OpportunityInDB(OpportunityBase):
    """数据库中的商机模式"""
    id: int
    lead_id: int
    team_leader_id: int
    status: OpportunityStatus
    expected_amount: Optional[str] = None
    lost_reason: Optional[str] = None
    won_amount: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    status_changed_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class OpportunityResponse(OpportunityInDB):
    """商机响应模式（包含关联信息）"""
    collaborative_members: List[CollaborativeMemberResponse] = []
    # 线索信息
    lead_id: Optional[int] = None
    lead_customer_name: Optional[str] = None
    lead_requirement_direction: Optional[str] = None
    
    # 任务信息
    task_name: Optional[str] = None
    task_sales_unit: Optional[str] = None
    
    # 组长信息
    team_leader_name: Optional[str] = None
    team_leader_username: Optional[str] = None
    
    @classmethod
    def from_orm_with_relations(cls, opportunity, db=None):
        """从ORM对象创建响应，包含关联信息"""
        from app.utils.product_utils import convert_product_value_to_label
        
        # 转换required_products：将value转换为label
        required_products_display = opportunity.required_products
        if db and opportunity.required_products:
            required_products_display = convert_product_value_to_label(
                opportunity.required_products, db
            )
        
        data = {
            "id": opportunity.id,
            "opportunity_no": opportunity.opportunity_no,
            "lead_id": opportunity.lead_id,
            "task_id": opportunity.task_id,
            "team_leader_id": opportunity.team_leader_id,
            "customer_unit": opportunity.customer_unit,
            "required_products": required_products_display,
            "description": opportunity.description,
            "expected_amount": opportunity.expected_amount,
            "status": opportunity.status,
            "lost_reason": opportunity.lost_reason,
            "won_amount": opportunity.won_amount,
            "created_at": opportunity.created_at,
            "updated_at": opportunity.updated_at,
            "status_changed_at": opportunity.status_changed_at,
        }
        
        # 填充线索信息
        if opportunity.lead:
            data["lead_id"] = opportunity.lead.id
            data["lead_customer_name"] = opportunity.lead.customer_name
            data["lead_requirement_direction"] = opportunity.lead.requirement_direction
        
        # 填充任务信息
        if opportunity.task:
            data["task_name"] = opportunity.task.task_name
            data["task_sales_unit"] = opportunity.task.sales_unit
        
        # 填充组长信息
        if opportunity.team_leader:
            data["team_leader_name"] = opportunity.team_leader.real_name
            data["team_leader_username"] = opportunity.team_leader.username
        
        # 处理协同人员
        collaborative_members = []
        if hasattr(opportunity, 'collaborative_members') and opportunity.collaborative_members:
            for member in opportunity.collaborative_members:
                collaborative_members.append(CollaborativeMemberResponse.from_orm_with_relations(member))
        data["collaborative_members"] = collaborative_members
        
        return cls(**data)

