"""
统计数据相关的 Pydantic 模式
"""
from pydantic import BaseModel
from typing import Optional, List, Dict, Tuple
from datetime import date, datetime


class TaskStatistics(BaseModel):
    """任务统计"""
    total: int = 0
    pending: int = 0
    confirmed: int = 0
    detail_submitted: int = 0
    dispatched: int = 0
    in_progress: int = 0
    completed: int = 0
    rejected: int = 0
    cancelled: int = 0
    completion_rate: float = 0.0  # 完成率


class OpportunityStatistics(BaseModel):
    """商机统计"""
    total: int = 0
    created: int = 0
    in_progress: int = 0
    lost: int = 0
    won: int = 0
    conversion_rate: float = 0.0  # 转化率（转定/总数）
    loss_rate: float = 0.0  # 流失率（流失/总数）


class WorkOrderStatistics(BaseModel):
    """工单统计"""
    total: int = 0
    pending: int = 0
    accepted: int = 0
    in_progress: int = 0
    completed: int = 0
    cancelled: int = 0
    completion_rate: float = 0.0  # 完成率


class VisitLogStatistics(BaseModel):
    """拜访日志统计"""
    total: int = 0
    with_opportunity: int = 0
    without_opportunity: int = 0
    opportunity_rate: float = 0.0  # 商机率


class ReviewStatistics(BaseModel):
    """复盘统计"""
    total: int = 0


class MemberWorkload(BaseModel):
    """成员工作量"""
    member_id: int
    member_name: str
    work_order_count: int = 0
    visit_log_count: int = 0
    completed_work_orders: int = 0


class DashboardStatistics(BaseModel):
    """工作台统计数据"""
    tasks: TaskStatistics
    opportunities: OpportunityStatistics
    work_orders: WorkOrderStatistics
    visit_logs: VisitLogStatistics
    reviews: ReviewStatistics
    member_workloads: List[MemberWorkload] = []


class TimeRangeStatistics(BaseModel):
    """时间段统计"""
    date: date
    task_count: int = 0
    work_order_count: int = 0
    visit_log_count: int = 0
    opportunity_count: int = 0


class SalesUnitStatistics(BaseModel):
    """销售单位统计"""
    sales_unit: str
    task_count: int = 0
    work_order_count: int = 0
    opportunity_count: int = 0
    conversion_rate: float = 0.0


class SalesUnitPerformanceStatistics(BaseModel):
    """销售单位绩效统计（按客户来源分组）"""
    sales_unit: str  # 客户来源（销售单位）
    appointments_made: int = 0  # 已预约（工单数量）
    visits_completed: int = 0  # 已拜访（拜访日志数量）
    effective_appointment_rate: float = 0.0  # 有效预约率 = 已拜访 / 已预约
    has_decision_authority: int = 0  # 有拜访对象权限（建议权或决策权）的拜访日志数量
    effective_visit_rate: float = 0.0  # 有效拜访率 = 有决策/建议权 / 已拜访
    lead_count: int = 0  # 线索数量
    opportunity_count: int = 0  # 商机数量
    lead_mining_rate: float = 0.0  # 线索挖掘率 = 线索数量 / 有决策/建议权
    lead_conversion_rate: float = 0.0  # 线索转化率 = 商机数量 / 线索数量


class RequirementDirectionStatistics(BaseModel):
    """需求方向统计"""
    direction: str  # 需求方向名称
    count: int = 0  # 数量


class RequirementDirectionGroupStatistics(BaseModel):
    """需求方向分组统计"""
    category: str  # 分类：算力、模型、应用
    directions: List[RequirementDirectionStatistics] = []  # 该分类下的需求方向统计列表


class MemberDetailStatistics(BaseModel):
    """成员明细统计"""
    member_id: int
    member_name: str
    appointments_made: int = 0  # 已预约（工单数量）
    visits_completed: int = 0  # 已拜访（拜访日志数量）
    effective_appointment_rate: float = 0.0  # 有效预约率
    has_decision_authority: int = 0  # 有拜访对象权限（建议权或决策权）
    effective_visit_rate: float = 0.0  # 有效拜访率
    lead_count: int = 0  # 线索数量
    opportunity_count: int = 0  # 商机数量
    lead_mining_rate: float = 0.0  # 线索挖掘率
    lead_conversion_rate: float = 0.0  # 线索转化率


class SalesUnitPerformanceResponse(BaseModel):
    """销售单位绩效统计响应"""
    statistics: List[SalesUnitPerformanceStatistics] = []  # 按销售单位分组的统计
    requirement_directions: List[RequirementDirectionGroupStatistics] = []  # 需求方向统计（按分类分组）
    member_details: Optional[List[MemberDetailStatistics]] = None  # 成员明细统计（仅组长可用）


class OpportunityConvertedAmountStatistics(BaseModel):
    """转订商机总金额统计"""
    member_id: Optional[int] = None  # 成员ID（仅成员明细时使用）
    member_name: Optional[str] = None  # 成员名称（仅成员明细时使用）
    group_id: Optional[int] = None  # 分组ID（仅总管查看组明细时使用）
    group_name: Optional[str] = None  # 分组名称（仅总管查看组明细时使用）
    converted_count: int = 0  # 转订商机数量
    total_amount: float = 0.0  # 转订商机总金额（元）