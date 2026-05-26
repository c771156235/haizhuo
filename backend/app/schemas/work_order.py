"""
工单相关的 Pydantic 模式
"""
from pydantic import BaseModel
from typing import Optional, Literal
from datetime import datetime, date
from app.models.work_order import WorkOrderStatus


class WorkOrderBase(BaseModel):
    """工单基础模式"""
    work_order_no: str
    task_id: int
    team_leader_id: Optional[int] = None


class WorkOrderCreate(BaseModel):
    """创建工单模式（总管手动建单时须指定组长）"""
    work_order_no: str
    task_id: int
    team_leader_id: int
    member_id: Optional[int] = None


class WorkOrderAssign(BaseModel):
    """转派工单模式"""
    member_id: int


class WorkOrderTeamLeaderUpdate(BaseModel):
    """修改工单组长模式"""
    team_leader_id: int
    reason: Optional[str] = None


class WorkOrderCancel(BaseModel):
    """取消工单模式"""
    cancellation_reason: Optional[str] = None


class WorkOrderTransfer(BaseModel):
    """成员转单模式"""
    target_type: Literal["member", "team_leader"]
    target_user_id: int
    reason: Optional[str] = None


class IntraGroupTransferMemberItem(BaseModel):
    """成员转单「转给组内成员」时的可选用户（与后端同组校验一致）"""

    id: int
    username: str
    real_name: str

    class Config:
        from_attributes = True


class WorkOrderUpdate(BaseModel):
    """更新工单模式"""
    member_id: Optional[int] = None
    status: Optional[WorkOrderStatus] = None


class WorkOrderInDB(WorkOrderBase):
    """数据库中的工单模式"""
    id: int
    member_id: Optional[int] = None
    status: WorkOrderStatus
    created_at: datetime
    updated_at: datetime
    accepted_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    cancelled_at: Optional[datetime] = None
    cancellation_reason: Optional[str] = None
    
    class Config:
        from_attributes = True


class WorkOrderResponse(WorkOrderInDB):
    """工单响应模式（包含关联信息）"""
    # 任务信息
    task_name: Optional[str] = None
    task_sales_unit: Optional[str] = None
    
    # 组长信息
    team_leader_name: Optional[str] = None
    team_leader_username: Optional[str] = None
    # 工单组长所属 FDE 组名（用于拜访日志等场景展示）
    group_name: Optional[str] = None
    
    # 成员信息
    member_name: Optional[str] = None
    member_username: Optional[str] = None
    
    # 详细需求信息
    detail_requirement_id: Optional[int] = None
    customer_unit: Optional[str] = None
    industry_type: Optional[str] = None
    customer_source: Optional[str] = None
    requirement_content: Optional[str] = None
    expected_visit_time: Optional[datetime] = None
    # 与详细需求一致：客户拜访与客户经理（专项任务发起人流程中填写）
    customer_visit_address: Optional[str] = None
    customer_manager_name: Optional[str] = None
    customer_manager_contact: Optional[str] = None
    sales_contact_name: Optional[str] = None  # 提交人姓名
    sales_contact_unit: Optional[str] = None  # 提交人所属销售单位
    
    @classmethod
    def from_orm_with_relations(cls, work_order):
        """从ORM对象创建响应，包含关联信息"""
        data = {
            "id": work_order.id,
            "work_order_no": work_order.work_order_no,
            "task_id": work_order.task_id,
            "team_leader_id": work_order.team_leader_id,
            "member_id": work_order.member_id,
            "status": work_order.status,
            "created_at": work_order.created_at,
            "updated_at": work_order.updated_at,
            "accepted_at": work_order.accepted_at,
            "completed_at": work_order.completed_at,
            "cancelled_at": work_order.cancelled_at,
            "cancellation_reason": work_order.cancellation_reason,
        }
        
        # 填充任务信息
        if work_order.task:
            data["task_name"] = work_order.task.task_name
            data["task_sales_unit"] = work_order.task.sales_unit
        
        # 填充组长信息
        if work_order.team_leader:
            data["team_leader_name"] = work_order.team_leader.real_name
            data["team_leader_username"] = work_order.team_leader.username
        
        # 填充成员信息
        if work_order.member:
            data["member_name"] = work_order.member.real_name
            data["member_username"] = work_order.member.username
        
        return cls(**data)
