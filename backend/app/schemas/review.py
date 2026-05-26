"""
复盘相关的 Pydantic 模式
"""
from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ReviewBase(BaseModel):
    """复盘基础模式"""
    visit_log_id: int
    comment: Optional[str] = None
    review_summary: Optional[str] = None


class ReviewCreate(ReviewBase):
    """创建复盘模式"""
    pass


class ReviewUpdate(BaseModel):
    """更新复盘模式"""
    comment: Optional[str] = None
    review_summary: Optional[str] = None


class ReviewInDB(ReviewBase):
    """数据库中的复盘模式"""
    id: int
    team_leader_id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class ReviewResponse(ReviewInDB):
    """复盘响应模式（包含关联信息）"""
    # 拜访日志信息
    visit_log_visit_date: Optional[str] = None
    visit_log_work_order_no: Optional[str] = None
    visit_log_task_name: Optional[str] = None
    visit_log_task_sales_unit: Optional[str] = None
    
    # 组长信息
    team_leader_name: Optional[str] = None
    team_leader_username: Optional[str] = None
    
    @classmethod
    def from_orm_with_relations(cls, review):
        """从ORM对象创建响应，包含关联信息"""
        data = {
            "id": review.id,
            "visit_log_id": review.visit_log_id,
            "team_leader_id": review.team_leader_id,
            "comment": review.comment,
            "review_summary": review.review_summary,
            "created_at": review.created_at,
            "updated_at": review.updated_at,
        }
        
        # 填充拜访日志信息
        if review.visit_log:
            data["visit_log_visit_date"] = review.visit_log.visit_date.isoformat() if review.visit_log.visit_date else None
            if review.visit_log.work_order:
                data["visit_log_work_order_no"] = review.visit_log.work_order.work_order_no
                if review.visit_log.work_order.task:
                    data["visit_log_task_name"] = review.visit_log.work_order.task.task_name
                    data["visit_log_task_sales_unit"] = review.visit_log.work_order.task.sales_unit
        
        # 填充组长信息
        if review.team_leader:
            data["team_leader_name"] = review.team_leader.real_name
            data["team_leader_username"] = review.team_leader.username
        
        return cls(**data)

