"""
统计数据 API
"""
from typing import Optional, List, Tuple
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, or_
from datetime import datetime, date, timedelta
from calendar import monthrange
from app.database import get_db
from app.models.user import User, UserRole
from app.models.task import Task, TaskStatus, TaskDetailRequirement
from app.models.work_order import WorkOrder, WorkOrderStatus
from app.models.opportunity import Opportunity, OpportunityStatus
from app.models.visit_log import VisitLog
from app.schemas.visit_log import visit_log_counts_as_has_authority, visit_log_counts_as_has_clue
from app.models.review import Review
from app.models.lead import Lead
from app.models.group import Group, group_members, group_leaders
from app.schemas.statistics import (
    DashboardStatistics, TaskStatistics, OpportunityStatistics,
    WorkOrderStatistics, VisitLogStatistics, ReviewStatistics,
    MemberWorkload, TimeRangeStatistics, SalesUnitStatistics,
    SalesUnitPerformanceStatistics, RequirementDirectionStatistics,
    RequirementDirectionGroupStatistics, SalesUnitPerformanceResponse,
    OpportunityConvertedAmountStatistics
)
from app.api.deps import get_current_user, get_current_role
from app.core.permissions import can_view_task
from app.utils.opportunity_query_scope import apply_opportunity_list_role_scope
from app.utils.work_order_query_scope import apply_work_order_role_scope
from app.utils.visit_log_query_scope import apply_visit_log_role_scope
from app.utils.lead_query_scope import apply_lead_list_role_scope
from app.utils.team_leader_peer_scope import get_peer_team_leader_ids
from app.utils.work_order_pool import work_orders_visible_to_team_leader_filter

router = APIRouter(prefix="/statistics", tags=["统计数据"])


def apply_work_order_statistics_scope(
    db: Session,
    current_user: User,
    current_role,
    group_id: Optional[int] = None,
):
    """工单统计基数：与 get_work_orders 一致；总管且带 group_id 时按该组组长创建组收敛。"""
    q = db.query(WorkOrder)
    if current_role.role == UserRole.MANAGER and group_id:
        group = db.query(Group).filter(Group.id == group_id).first()
        if group and group.leader_id:
            return q.filter(
                or_(
                    WorkOrder.team_leader_id == group.leader_id,
                    and_(
                        WorkOrder.dispatch_group_id == group_id,
                        WorkOrder.status == WorkOrderStatus.PENDING_GROUP_CLAIM.value,
                    ),
                )
            )
        return q.filter(WorkOrder.id == -1)
    if current_role.role == UserRole.MANAGER:
        return q
    return apply_work_order_role_scope(q, db, current_user, current_role)


def apply_visit_log_statistics_scope(
    db: Session,
    current_user: User,
    current_role,
    group_id: Optional[int] = None,
):
    """拜访日志统计基数：与 get_visit_logs 一致；总管且带 group_id 时按组内工单收敛。"""
    q = db.query(VisitLog)
    if current_role.role == UserRole.MANAGER and group_id:
        group = db.query(Group).filter(Group.id == group_id).first()
        if not group or not group.leader_id:
            return q.filter(VisitLog.id == -1)
        work_orders = db.query(WorkOrder).filter(
            or_(
                WorkOrder.team_leader_id == group.leader_id,
                WorkOrder.dispatch_group_id == group_id,
            )
        ).all()
        work_order_ids = [wo.id for wo in work_orders]
        if work_order_ids:
            return q.filter(VisitLog.work_order_id.in_(work_order_ids))
        return q.filter(VisitLog.id == -1)
    if current_role.role == UserRole.MANAGER:
        return q
    return apply_visit_log_role_scope(q, db, current_user, current_role)


def apply_opportunity_statistics_scope(
    db: Session,
    current_user: User,
    current_role,
    group_id: Optional[int] = None,
):
    """商机统计基数：与 get_opportunities 一致；总管且带 group_id 时按商机 team_leader_id 收敛。"""
    q = db.query(Opportunity)
    if current_role.role == UserRole.MANAGER and group_id:
        group = db.query(Group).filter(Group.id == group_id).first()
        if group and group.leader_id:
            return q.filter(Opportunity.team_leader_id == group.leader_id)
        return q.filter(Opportunity.id == -1)
    if current_role.role == UserRole.MANAGER:
        return q
    return apply_opportunity_list_role_scope(q, db, current_user, current_role, member_id=None)


def _visible_opportunity_ids_for_stats(
    db: Session, current_user: User, current_role
) -> Optional[List[int]]:
    """非总管返回当前角色可见商机 id；总管返回 None 表示不做 id 交集。"""
    if current_role.role == UserRole.MANAGER:
        return None
    q = apply_opportunity_list_role_scope(
        db.query(Opportunity.id), db, current_user, current_role, member_id=None
    )
    return [row[0] for row in q.distinct().all()]


def _extract_direction_from_display(direction_display: str) -> str:
    """从显示字符串中提取需求方向部分（辅助函数）"""
    if " - " in direction_display:
        # 格式：分类 - 需求方向，例如"算力 - 英伟达算力"
        parts = direction_display.split(" - ", 1)
        if len(parts) == 2:
            return parts[1].strip()  # 提取需求方向部分
    # 如果没有分隔符，直接使用（兼容旧数据或特殊情况）
    return direction_display.strip()


def get_user_group_members(db: Session, team_leader_id: int) -> List[int]:
    """获取组长所在分组的所有成员ID（包括组长自己）"""
    # 查找组长所在的分组（兼容 leader_id 与 group_leaders）
    group = db.query(Group).join(
        group_leaders, Group.id == group_leaders.c.group_id, isouter=True
    ).filter(
        or_(Group.leader_id == team_leader_id, group_leaders.c.user_id == team_leader_id)
    ).distinct().first()
    if not group:
        # 如果没有找到分组，返回空列表（只包含组长自己）
        return [team_leader_id]
    
    # 获取组内所有成员ID
    member_ids = db.query(group_members.c.user_id).filter(
        group_members.c.group_id == group.id
    ).all()
    
    # 转换为列表，并确保包含该组全部组长
    member_id_list = [mid[0] for mid in member_ids]
    leader_ids = set()
    if group.leader_id:
        leader_ids.add(group.leader_id)
    for leader in group.leaders or []:
        if leader and leader.id:
            leader_ids.add(leader.id)
    for leader_id in leader_ids:
        if leader_id not in member_id_list:
            member_id_list.append(leader_id)
    if team_leader_id not in member_id_list:
        member_id_list.append(team_leader_id)
    
    return member_id_list


def get_group_member_ids(db: Session, group_id: int) -> List[int]:
    """获取指定分组的所有成员ID"""
    member_ids = db.query(group_members.c.user_id).filter(
        group_members.c.group_id == group_id
    ).all()
    return [mid[0] for mid in member_ids]


def get_task_statistics(
    db: Session, 
    current_user: User, 
    current_role,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None
) -> TaskStatistics:
    """获取任务统计（基于当前激活角色）"""
    query = db.query(Task)
    
    # 根据当前激活角色过滤
    if current_role.role == UserRole.TASK_INITIATOR:
        query = query.filter(Task.initiator_id == current_user.id)
    elif current_role.role == UserRole.SALES_CONTACT:
        # 销售单位接口人可以查看销售单位匹配的任务
        # 使用当前激活角色的sales_unit
        user_sales_unit = current_role.sales_unit or current_user.sales_unit
        if user_sales_unit:
            query = query.filter(Task.sales_unit.like(f"%{user_sales_unit}%"))
        else:
            # 兼容旧逻辑
            query = query.filter(Task.sales_contact_id == current_user.id)
    elif current_role.role == UserRole.TEAM_LEADER:
        work_orders = db.query(WorkOrder).filter(
            work_orders_visible_to_team_leader_filter(db, current_user.id)
        ).all()
        task_ids = [wo.task_id for wo in work_orders]
        query = query.filter(Task.id.in_(task_ids))
    elif current_role.role == UserRole.MEMBER:
        work_orders = db.query(WorkOrder).filter(WorkOrder.member_id == current_user.id).all()
        task_ids = [wo.task_id for wo in work_orders]
        query = query.filter(Task.id.in_(task_ids))
    elif current_role.role == UserRole.MANAGER:
        # 总管可以看到所有任务，但不包括草稿状态的任务（草稿状态只有创建者可见）
        query = query.filter(Task.status != TaskStatus.DRAFT)
    
    # 添加时间范围过滤
    if start_date:
        query = query.filter(func.date(Task.created_at) >= start_date)
    if end_date:
        query = query.filter(func.date(Task.created_at) <= end_date)
    
    total = query.count()
    pending = query.filter(Task.status == TaskStatus.PENDING).count()
    confirmed = query.filter(Task.status == TaskStatus.CONFIRMED).count()
    detail_submitted = query.filter(Task.status == TaskStatus.DETAIL_SUBMITTED).count()
    dispatched = query.filter(Task.status == TaskStatus.DISPATCHED).count()
    in_progress = query.filter(Task.status == TaskStatus.IN_PROGRESS).count()
    completed = query.filter(Task.status == TaskStatus.COMPLETED).count()
    rejected = query.filter(Task.status == TaskStatus.REJECTED).count()
    cancelled = query.filter(Task.status == TaskStatus.CANCELLED).count()
    
    # 计算完成率（已完成 / (已完成 + 进行中 + 已派单)）")
    active_tasks = completed + in_progress + dispatched
    completion_rate = (completed / active_tasks * 100) if active_tasks > 0 else 0.0
    
    return TaskStatistics(
        total=total,
        pending=pending,
        confirmed=confirmed,
        detail_submitted=detail_submitted,
        dispatched=dispatched,
        in_progress=in_progress,
        completed=completed,
        rejected=rejected,
        cancelled=cancelled,
        completion_rate=round(completion_rate, 2)
    )


def get_opportunity_statistics(
    db: Session, 
    current_user: User, 
    current_role,
    group_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None
) -> OpportunityStatistics:
    """获取商机统计（基于当前激活角色）
    
    注意：统计时使用创建时的组（通过商机的team_leader_id或工单的team_leader_id判断），
    而不是成员当前所在的组，确保成员变更组后历史数据仍保留在原组统计中。
    """
    query = apply_opportunity_statistics_scope(
        db, current_user, current_role, group_id
    )

    # 添加时间范围过滤
    if start_date:
        query = query.filter(func.date(Opportunity.created_at) >= start_date)
    if end_date:
        query = query.filter(func.date(Opportunity.created_at) <= end_date)
    
    total = query.count()
    created = query.filter(Opportunity.status == OpportunityStatus.CREATED).count()
    in_progress = query.filter(Opportunity.status == OpportunityStatus.IN_PROGRESS).count()
    lost = query.filter(Opportunity.status == OpportunityStatus.LOST).count()
    won = query.filter(Opportunity.status == OpportunityStatus.WON).count()
    
    # 计算转化率和流失率
    conversion_rate = (won / total * 100) if total > 0 else 0.0
    loss_rate = (lost / total * 100) if total > 0 else 0.0
    
    return OpportunityStatistics(
        total=total,
        created=created,
        in_progress=in_progress,
        lost=lost,
        won=won,
        conversion_rate=round(conversion_rate, 2),
        loss_rate=round(loss_rate, 2)
    )


def get_work_order_statistics(
    db: Session, 
    current_user: User, 
    current_role,
    group_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None
) -> WorkOrderStatistics:
    """获取工单统计（基于当前激活角色）
    
    注意：统计时使用创建时的组（通过工单的team_leader_id判断），
    而不是成员当前所在的组，确保成员变更组后历史数据仍保留在原组统计中。
    """
    query = apply_work_order_statistics_scope(db, current_user, current_role, group_id)

    # 添加时间范围过滤
    if start_date:
        query = query.filter(func.date(WorkOrder.created_at) >= start_date)
    if end_date:
        query = query.filter(func.date(WorkOrder.created_at) <= end_date)
    
    total = query.count()
    # 待组内认领、待转派和待接单都算作待处理
    pending = query.filter(
        WorkOrder.status.in_(
            [
                WorkOrderStatus.PENDING_GROUP_CLAIM.value,
                WorkOrderStatus.PENDING_ASSIGN.value,
                WorkOrderStatus.PENDING_ACCEPT.value,
            ]
        )
    ).count()
    accepted = query.filter(WorkOrder.status == WorkOrderStatus.ACCEPTED.value).count()
    in_progress = query.filter(WorkOrder.status == WorkOrderStatus.IN_PROGRESS.value).count()
    completed = query.filter(WorkOrder.status == WorkOrderStatus.COMPLETED.value).count()
    cancelled = query.filter(WorkOrder.status == WorkOrderStatus.CANCELLED.value).count()
    
    # 计算完成率
    active_work_orders = completed + in_progress + accepted
    completion_rate = (completed / active_work_orders * 100) if active_work_orders > 0 else 0.0
    
    return WorkOrderStatistics(
        total=total,
        pending=pending,
        accepted=accepted,
        in_progress=in_progress,
        completed=completed,
        cancelled=cancelled,
        completion_rate=round(completion_rate, 2)
    )


def get_visit_log_statistics(
    db: Session, 
    current_user: User, 
    current_role,
    group_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None
) -> VisitLogStatistics:
    """获取拜访日志统计（基于当前激活角色）
    
    注意：统计时使用创建时的组（通过工单的team_leader_id判断），
    而不是成员当前所在的组，确保成员变更组后历史数据仍保留在原组统计中。
    """
    query = apply_visit_log_statistics_scope(db, current_user, current_role, group_id)

    # 添加时间范围过滤
    if start_date:
        query = query.filter(func.date(VisitLog.visit_date) >= start_date)
    if end_date:
        query = query.filter(func.date(VisitLog.visit_date) <= end_date)
    
    total = query.count()
    with_opportunity = 0
    without_opportunity = total - with_opportunity
    
    # 计算商机率
    opportunity_rate = (with_opportunity / total * 100) if total > 0 else 0.0
    
    return VisitLogStatistics(
        total=total,
        with_opportunity=with_opportunity,
        without_opportunity=without_opportunity,
        opportunity_rate=round(opportunity_rate, 2)
    )


def get_review_statistics(
    db: Session, 
    current_user: User, 
    current_role,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None
) -> ReviewStatistics:
    """获取复盘统计（基于当前激活角色）"""
    query = db.query(Review)

    if current_role.role == UserRole.TEAM_LEADER:
        query = query.filter(Review.team_leader_id.in_(get_peer_team_leader_ids(db, current_user.id)))
    elif current_role.role == UserRole.MEMBER:
        query = query.filter(
            Review.visit_log.has(VisitLog.member_id == current_user.id)
        )
    elif current_role.role == UserRole.TASK_INITIATOR:
        query = query.filter(
            Review.visit_log.has(
                VisitLog.work_order.has(
                    WorkOrder.task.has(Task.initiator_id == current_user.id)
                )
            )
        )
    elif current_role.role == UserRole.SALES_CONTACT:
        vl_scope = apply_visit_log_statistics_scope(
            db, current_user, current_role, group_id=None
        )
        visit_log_ids = [row[0] for row in vl_scope.with_entities(VisitLog.id).all()]
        if visit_log_ids:
            query = query.filter(Review.visit_log_id.in_(visit_log_ids))
        else:
            query = query.filter(Review.id == -1)

    # 添加时间范围过滤
    if start_date:
        query = query.filter(func.date(Review.created_at) >= start_date)
    if end_date:
        query = query.filter(func.date(Review.created_at) <= end_date)
    
    total = query.count()
    
    return ReviewStatistics(total=total)


def get_member_workloads(
    db: Session, 
    current_user: User, 
    current_role, 
    limit: int = 10,
    group_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None
) -> List[MemberWorkload]:
    """获取成员工作量统计（基于当前激活角色）"""
    if current_role.role not in [UserRole.MANAGER, UserRole.TEAM_LEADER]:
        return []
    
    # 确定要统计的成员ID列表
    member_ids_to_filter = None
    
    if current_role.role == UserRole.TEAM_LEADER:
        # 组长：获取组内所有成员
        member_ids_to_filter = get_user_group_members(db, current_user.id)
    elif current_role.role == UserRole.MANAGER:
        # 总管：如果指定了group_id，只统计该分组；否则统计所有
        if group_id:
            member_ids_to_filter = get_group_member_ids(db, group_id)
            if not member_ids_to_filter:
                return []
    
    # 获取成员列表
    if member_ids_to_filter:
        # 只查询指定的成员
        members = db.query(User).filter(
            User.id.in_(member_ids_to_filter),
            User.is_active == True
        ).all()
    else:
        # 获取所有成员（总管查看全部）
        from app.models.user import UserRoleAssociation
        member_user_ids = db.query(UserRoleAssociation.user_id).filter(
            UserRoleAssociation.role == UserRole.MEMBER,
            UserRoleAssociation.approval_status == "approved",
            UserRoleAssociation.is_active == True
        ).distinct().all()
        member_ids = [uid[0] for uid in member_user_ids]
        if not member_ids:
            return []
        members = db.query(User).filter(
            User.id.in_(member_ids),
            User.is_active == True
        ).all()

    tl_peer_ids = (
        get_peer_team_leader_ids(db, current_user.id)
        if current_role.role == UserRole.TEAM_LEADER
        else []
    )

    workloads = []
    for member in members:
        # 工单统计
        work_order_query = db.query(WorkOrder).filter(WorkOrder.member_id == member.id)
        if current_role.role == UserRole.TEAM_LEADER:
            work_order_query = work_order_query.filter(
                WorkOrder.team_leader_id.in_(tl_peer_ids)
            )
        if start_date:
            work_order_query = work_order_query.filter(func.date(WorkOrder.created_at) >= start_date)
        if end_date:
            work_order_query = work_order_query.filter(func.date(WorkOrder.created_at) <= end_date)
        work_orders = work_order_query.all()
        work_order_count = len(work_orders)
        completed_work_orders = len([wo for wo in work_orders if wo.status == WorkOrderStatus.COMPLETED.value])
        
        # 拜访日志统计
        visit_log_query = db.query(VisitLog).filter(VisitLog.member_id == member.id)
        if current_role.role == UserRole.TEAM_LEADER:
            visit_log_query = visit_log_query.join(VisitLog.work_order).filter(
                WorkOrder.team_leader_id.in_(tl_peer_ids)
            )
        if start_date:
            visit_log_query = visit_log_query.filter(func.date(VisitLog.visit_date) >= start_date)
        if end_date:
            visit_log_query = visit_log_query.filter(func.date(VisitLog.visit_date) <= end_date)
        visit_log_count = visit_log_query.count()
        
        workloads.append(MemberWorkload(
            member_id=member.id,
            member_name=member.real_name or member.username,
            work_order_count=work_order_count,
            visit_log_count=visit_log_count,
            completed_work_orders=completed_work_orders
        ))
    
    # 按工作量排序
    workloads.sort(key=lambda x: x.work_order_count + x.visit_log_count, reverse=True)
    
    return workloads[:limit]


@router.get("/dashboard", response_model=DashboardStatistics)
def get_dashboard_statistics(
    group_id: Optional[int] = Query(None, description="分组ID（仅总管可用）"),
    start_date: Optional[str] = Query(None, description="开始日期（YYYY-MM-DD）"),
    end_date: Optional[str] = Query(None, description="结束日期（YYYY-MM-DD）"),
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """获取工作台统计数据（基于当前激活角色）"""
    current_user, current_role = user_role
    
    # 权限验证
    if group_id and current_role.role != UserRole.MANAGER:
        raise HTTPException(status_code=403, detail="只有总管可以指定分组ID")
    
    # 如果指定了group_id，验证分组是否存在
    if group_id:
        group = db.query(Group).filter(Group.id == group_id).first()
        if not group:
            raise HTTPException(status_code=404, detail="分组不存在")
    
    # 解析日期参数
    start_date_obj = None
    end_date_obj = None
    if start_date:
        try:
            start_date_obj = datetime.strptime(start_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="开始日期格式错误，应为YYYY-MM-DD")
    if end_date:
        try:
            end_date_obj = datetime.strptime(end_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="结束日期格式错误，应为YYYY-MM-DD")
    
    return DashboardStatistics(
        tasks=get_task_statistics(db, current_user, current_role, start_date_obj, end_date_obj),
        opportunities=get_opportunity_statistics(db, current_user, current_role, group_id, start_date_obj, end_date_obj),
        work_orders=get_work_order_statistics(db, current_user, current_role, group_id, start_date_obj, end_date_obj),
        visit_logs=get_visit_log_statistics(db, current_user, current_role, group_id, start_date_obj, end_date_obj),
        reviews=get_review_statistics(db, current_user, current_role, start_date_obj, end_date_obj),
        member_workloads=get_member_workloads(db, current_user, current_role, limit=10, group_id=group_id, start_date=start_date_obj, end_date=end_date_obj)
    )


@router.get("/tasks", response_model=TaskStatistics)
def get_task_statistics_api(
    start_date: Optional[str] = Query(None, description="开始日期（YYYY-MM-DD）"),
    end_date: Optional[str] = Query(None, description="结束日期（YYYY-MM-DD）"),
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """获取任务统计（基于当前激活角色）"""
    current_user, current_role = user_role
    
    # 解析日期参数
    start_date_obj = None
    end_date_obj = None
    if start_date:
        try:
            start_date_obj = datetime.strptime(start_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="开始日期格式错误，应为YYYY-MM-DD")
    if end_date:
        try:
            end_date_obj = datetime.strptime(end_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="结束日期格式错误，应为YYYY-MM-DD")
    
    return get_task_statistics(db, current_user, current_role, start_date_obj, end_date_obj)


@router.get("/opportunities", response_model=OpportunityStatistics)
def get_opportunity_statistics_api(
    group_id: Optional[int] = Query(None, description="分组ID（仅总管可用）"),
    start_date: Optional[str] = Query(None, description="开始日期（YYYY-MM-DD）"),
    end_date: Optional[str] = Query(None, description="结束日期（YYYY-MM-DD）"),
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """获取商机统计（基于当前激活角色）"""
    current_user, current_role = user_role
    
    # 权限验证
    if group_id and current_role.role != UserRole.MANAGER:
        raise HTTPException(status_code=403, detail="只有总管可以指定分组ID")
    
    # 如果指定了group_id，验证分组是否存在
    if group_id:
        group = db.query(Group).filter(Group.id == group_id).first()
        if not group:
            raise HTTPException(status_code=404, detail="分组不存在")
    
    # 解析日期参数
    start_date_obj = None
    end_date_obj = None
    if start_date:
        try:
            start_date_obj = datetime.strptime(start_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="开始日期格式错误，应为YYYY-MM-DD")
    if end_date:
        try:
            end_date_obj = datetime.strptime(end_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="结束日期格式错误，应为YYYY-MM-DD")
    
    return get_opportunity_statistics(db, current_user, current_role, group_id, start_date_obj, end_date_obj)


@router.get("/work-orders", response_model=WorkOrderStatistics)
def get_work_order_statistics_api(
    group_id: Optional[int] = Query(None, description="分组ID（仅总管可用）"),
    start_date: Optional[str] = Query(None, description="开始日期（YYYY-MM-DD）"),
    end_date: Optional[str] = Query(None, description="结束日期（YYYY-MM-DD）"),
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """获取工单统计（基于当前激活角色）"""
    current_user, current_role = user_role
    
    # 权限验证
    if group_id and current_role.role != UserRole.MANAGER:
        raise HTTPException(status_code=403, detail="只有总管可以指定分组ID")
    
    # 如果指定了group_id，验证分组是否存在
    if group_id:
        group = db.query(Group).filter(Group.id == group_id).first()
        if not group:
            raise HTTPException(status_code=404, detail="分组不存在")
    
    # 解析日期参数
    start_date_obj = None
    end_date_obj = None
    if start_date:
        try:
            start_date_obj = datetime.strptime(start_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="开始日期格式错误，应为YYYY-MM-DD")
    if end_date:
        try:
            end_date_obj = datetime.strptime(end_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="结束日期格式错误，应为YYYY-MM-DD")
    
    return get_work_order_statistics(db, current_user, current_role, group_id, start_date_obj, end_date_obj)


@router.get("/members/workload", response_model=List[MemberWorkload])
def get_member_workloads_api(
    limit: int = Query(10, ge=1, le=50, description="返回数量限制"),
    group_id: Optional[int] = Query(None, description="分组ID（仅总管可用）"),
    start_date: Optional[str] = Query(None, description="开始日期（YYYY-MM-DD）"),
    end_date: Optional[str] = Query(None, description="结束日期（YYYY-MM-DD）"),
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """获取成员工作量统计（基于当前激活角色）"""
    current_user, current_role = user_role
    if current_role.role not in [UserRole.MANAGER, UserRole.TEAM_LEADER]:
        raise HTTPException(status_code=403, detail="无权查看成员工作量统计")
    
    # 权限验证
    if group_id and current_role.role != UserRole.MANAGER:
        raise HTTPException(status_code=403, detail="只有总管可以指定分组ID")
    
    # 如果指定了group_id，验证分组是否存在
    if group_id:
        group = db.query(Group).filter(Group.id == group_id).first()
        if not group:
            raise HTTPException(status_code=404, detail="分组不存在")
    
    # 解析日期参数
    start_date_obj = None
    end_date_obj = None
    if start_date:
        try:
            start_date_obj = datetime.strptime(start_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="开始日期格式错误，应为YYYY-MM-DD")
    if end_date:
        try:
            end_date_obj = datetime.strptime(end_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="结束日期格式错误，应为YYYY-MM-DD")
    
    return get_member_workloads(db, current_user, current_role, limit, group_id, start_date_obj, end_date_obj)


def get_time_range_statistics(
    db: Session,
    current_user: User,
    current_role,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    group_by: str = "day",  # day, week, month
    group_id: Optional[int] = None
) -> List[TimeRangeStatistics]:
    """获取时间段统计（基于当前激活角色）"""
    from sqlalchemy import extract
    
    # 确定要统计的成员ID列表
    member_ids_to_filter = None
    
    if current_role.role == UserRole.MEMBER:
        member_ids_to_filter = [current_user.id]
    elif current_role.role == UserRole.TEAM_LEADER:
        member_ids_to_filter = get_user_group_members(db, current_user.id)
    elif current_role.role == UserRole.MANAGER and group_id:
        member_ids_to_filter = get_group_member_ids(db, group_id)
    
    # 默认查询最近30天
    if not end_date:
        end_date = date.today()
    if not start_date:
        start_date = end_date - timedelta(days=30)
    
    # 根据当前激活角色过滤任务
    task_query = db.query(Task)
    if current_role.role == UserRole.TASK_INITIATOR:
        task_query = task_query.filter(Task.initiator_id == current_user.id)
    elif current_role.role == UserRole.SALES_CONTACT:
        # 销售单位接口人可以查看销售单位匹配的任务
        # 使用当前激活角色的sales_unit
        user_sales_unit = current_role.sales_unit or current_user.sales_unit
        if user_sales_unit:
            task_query = task_query.filter(Task.sales_unit.like(f"%{user_sales_unit}%"))
        else:
            # 兼容旧逻辑
            task_query = task_query.filter(Task.sales_contact_id == current_user.id)
    elif current_role.role == UserRole.TEAM_LEADER:
        # 组长：通过工单的team_leader_id过滤，确保只统计创建时属于自己组的工单
        work_orders = db.query(WorkOrder).filter(
            work_orders_visible_to_team_leader_filter(db, current_user.id)
        ).all()
        task_ids = [wo.task_id for wo in work_orders]
        if task_ids:
            task_query = task_query.filter(Task.id.in_(task_ids))
        else:
            return []
    elif current_role.role == UserRole.MEMBER:
        work_orders = db.query(WorkOrder).filter(WorkOrder.member_id == current_user.id).all()
        task_ids = [wo.task_id for wo in work_orders]
        if task_ids:
            task_query = task_query.filter(Task.id.in_(task_ids))
        else:
            return []
    elif current_role.role == UserRole.MANAGER and group_id:
        # 总管按组统计：通过组的leader_id找到该组的组长，然后通过工单的team_leader_id过滤
        group = db.query(Group).filter(Group.id == group_id).first()
        if group and group.leader_id:
            work_orders = db.query(WorkOrder).filter(
                or_(
                    WorkOrder.team_leader_id == group.leader_id,
                    WorkOrder.dispatch_group_id == group_id,
                )
            ).all()
            task_ids = [wo.task_id for wo in work_orders]
            if task_ids:
                task_query = task_query.filter(Task.id.in_(task_ids))
            else:
                return []
        else:
            return []
    
    # 生成日期范围
    statistics = []
    current = start_date
    while current <= end_date:
        # 根据分组类型确定日期范围
        if group_by == "day":
            date_start = current
            date_end = current
        elif group_by == "week":
            # 周的开始（周一）
            days_since_monday = current.weekday()
            date_start = current - timedelta(days=days_since_monday)
            date_end = date_start + timedelta(days=6)
        else:  # month
            # 月的第一天和最后一天
            date_start = current.replace(day=1)
            last_day = monthrange(current.year, current.month)[1]
            date_end = current.replace(day=last_day)
        
        # 统计任务
        task_count = task_query.filter(
            func.date(Task.created_at) >= date_start,
            func.date(Task.created_at) <= date_end
        ).count()
        
        work_order_query = apply_work_order_statistics_scope(
            db, current_user, current_role, group_id
        )

        work_order_count = work_order_query.filter(
            func.date(WorkOrder.created_at) >= date_start,
            func.date(WorkOrder.created_at) <= date_end
        ).count()
        
        visit_log_query = apply_visit_log_statistics_scope(
            db, current_user, current_role, group_id
        )

        visit_log_count = visit_log_query.filter(
            func.date(VisitLog.visit_date) >= date_start,
            func.date(VisitLog.visit_date) <= date_end
        ).count()
        
        opportunity_query = apply_opportunity_statistics_scope(
            db, current_user, current_role, group_id
        )

        opportunity_count = opportunity_query.filter(
            func.date(Opportunity.created_at) >= date_start,
            func.date(Opportunity.created_at) <= date_end
        ).count()
        
        statistics.append(TimeRangeStatistics(
            date=current,
            task_count=task_count,
            work_order_count=work_order_count,
            visit_log_count=visit_log_count,
            opportunity_count=opportunity_count
        ))
        
        # 移动到下一个时间段
        if group_by == "day":
            current = current + timedelta(days=1)
        elif group_by == "week":
            current = current + timedelta(days=7)
        else:  # month
            if current.month == 12:
                current = current.replace(year=current.year + 1, month=1)
            else:
                current = current.replace(month=current.month + 1)
    
    return statistics


def get_sales_unit_statistics(
    db: Session, 
    current_user: User, 
    current_role,
    group_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None
) -> List[SalesUnitStatistics]:
    """获取销售单位统计（基于当前激活角色）"""
    # 确定要统计的成员ID列表
    member_ids_to_filter = None
    
    if current_role.role == UserRole.MEMBER:
        member_ids_to_filter = [current_user.id]
    elif current_role.role == UserRole.TEAM_LEADER:
        member_ids_to_filter = get_user_group_members(db, current_user.id)
    elif current_role.role == UserRole.MANAGER and group_id:
        member_ids_to_filter = get_group_member_ids(db, group_id)
    
    # 根据当前激活角色过滤任务
    task_query = db.query(Task)
    if current_role.role == UserRole.TASK_INITIATOR:
        task_query = task_query.filter(Task.initiator_id == current_user.id)
    elif current_role.role == UserRole.SALES_CONTACT:
        # 销售单位接口人可以查看销售单位匹配的任务
        # 使用当前激活角色的sales_unit
        user_sales_unit = current_role.sales_unit or current_user.sales_unit
        if user_sales_unit:
            task_query = task_query.filter(Task.sales_unit.like(f"%{user_sales_unit}%"))
        else:
            # 兼容旧逻辑
            task_query = task_query.filter(Task.sales_contact_id == current_user.id)
    elif current_role.role == UserRole.TEAM_LEADER:
        # 组长：通过工单的team_leader_id过滤，确保只统计创建时属于自己组的工单
        work_orders = db.query(WorkOrder).filter(
            work_orders_visible_to_team_leader_filter(db, current_user.id)
        ).all()
        task_ids = [wo.task_id for wo in work_orders]
        if task_ids:
            task_query = task_query.filter(Task.id.in_(task_ids))
        else:
            return []
    elif current_role.role == UserRole.MEMBER:
        work_orders = db.query(WorkOrder).filter(WorkOrder.member_id == current_user.id).all()
        task_ids = [wo.task_id for wo in work_orders]
        if task_ids:
            task_query = task_query.filter(Task.id.in_(task_ids))
        else:
            return []
    elif current_role.role == UserRole.MANAGER and group_id:
        # 总管按组统计：通过组的leader_id找到该组的组长，然后通过工单的team_leader_id过滤
        group = db.query(Group).filter(Group.id == group_id).first()
        if group and group.leader_id:
            work_orders = db.query(WorkOrder).filter(
                or_(
                    WorkOrder.team_leader_id == group.leader_id,
                    WorkOrder.dispatch_group_id == group_id,
                )
            ).all()
            task_ids = [wo.task_id for wo in work_orders]
            if task_ids:
                task_query = task_query.filter(Task.id.in_(task_ids))
            else:
                return []
        else:
            return []
    
    # 添加时间范围过滤
    if start_date:
        task_query = task_query.filter(func.date(Task.created_at) >= start_date)
    if end_date:
        task_query = task_query.filter(func.date(Task.created_at) <= end_date)
    
    # 获取所有任务，提取并去重销售单位
    all_tasks = task_query.all()
    sales_unit_set = set()
    for task in all_tasks:
        if task.sales_unit:
            # 拆分逗号分隔的销售单位
            units = [unit.strip() for unit in task.sales_unit.split(',') if unit.strip()]
            # 过滤掉"全部"，因为"全部"不是具体的销售单位，不应该单独统计
            units = [unit for unit in units if unit != '全部']
            sales_unit_set.update(units)
    
    sales_unit_list = sorted(list(sales_unit_set))
    
    statistics = []
    for sales_unit in sales_unit_list:
        # 统计任务（使用LIKE查询匹配包含该销售单位的任务）
        tasks = task_query.filter(Task.sales_unit.like(f'%{sales_unit}%')).all()
        task_count = len(tasks)
        task_ids = [t.id for t in tasks]
        
        # 统计工单：根据工单关联的需求的销售单位来过滤
        # 先获取该销售单位提交的需求ID列表
        # 通过需求的sales_contact_id和销售单位匹配
        from sqlalchemy.orm import joinedload
        
        # 获取该销售单位的所有用户ID（通过销售单位精确匹配）
        # 获取所有用户，然后在应用层进行精确匹配（支持精确匹配和包含匹配）
        all_users = db.query(User).filter(User.sales_unit.isnot(None)).all()
        sales_unit_user_ids = []
        for user in all_users:
            if user.sales_unit:
                # 精确匹配
                if user.sales_unit == sales_unit:
                    sales_unit_user_ids.append(user.id)
                # 包含匹配：用户的销售单位包含目标销售单位，或目标销售单位包含用户的销售单位
                elif sales_unit in user.sales_unit or user.sales_unit in sales_unit:
                    sales_unit_user_ids.append(user.id)
        
        # 获取这些用户提交的需求ID列表
        requirement_ids = []
        if sales_unit_user_ids:
            requirements = db.query(TaskDetailRequirement.id).filter(
                TaskDetailRequirement.sales_contact_id.in_(sales_unit_user_ids),
                TaskDetailRequirement.task_id.in_(task_ids)
            ).all()
            requirement_ids = [rid[0] for rid in requirements]
        
        wo_scope = apply_work_order_statistics_scope(
            db, current_user, current_role, group_id
        )
        if requirement_ids:
            work_order_query = wo_scope.filter(
                WorkOrder.detail_requirement_id.in_(requirement_ids)
            )
        else:
            work_order_query = wo_scope.filter(
                WorkOrder.task_id.in_(task_ids),
                WorkOrder.detail_requirement_id.is_(None),
            )

        # 时间范围过滤
        if start_date:
            work_order_query = work_order_query.filter(func.date(WorkOrder.created_at) >= start_date)
        if end_date:
            work_order_query = work_order_query.filter(func.date(WorkOrder.created_at) <= end_date)
        
        work_order_count = work_order_query.count()
        
        if requirement_ids:
            work_order_query_for_opp = wo_scope.filter(
                WorkOrder.detail_requirement_id.in_(requirement_ids)
            )
        else:
            work_order_query_for_opp = wo_scope.filter(
                WorkOrder.task_id.in_(task_ids),
                WorkOrder.detail_requirement_id.is_(None),
            )
        work_order_ids_for_opportunity = [wo.id for wo in work_order_query_for_opp.all()]

        visit_log_ids_list: List[int] = []
        if work_order_ids_for_opportunity:
            visit_log_ids_list = [
                row[0]
                for row in db.query(VisitLog.id).filter(
                    VisitLog.work_order_id.in_(work_order_ids_for_opportunity)
                ).all()
            ]

        opp_scope = apply_opportunity_statistics_scope(
            db, current_user, current_role, group_id
        )
        # 商机仍通过 leads 表关联；按「该批工单下拜访日志」筛 visit_log_id，避免必须存在独立线索记录才能关联到工单
        if visit_log_ids_list:
            opportunity_query = opp_scope.join(Lead, Opportunity.lead_id == Lead.id).filter(
                Lead.visit_log_id.in_(visit_log_ids_list)
            )
        else:
            opportunity_query = opp_scope.filter(Opportunity.id == -1)

        # 时间范围过滤
        if start_date:
            opportunity_query = opportunity_query.filter(func.date(Opportunity.created_at) >= start_date)
        if end_date:
            opportunity_query = opportunity_query.filter(func.date(Opportunity.created_at) <= end_date)
        
        opportunity_count = opportunity_query.count()
        
        if visit_log_ids_list:
            won_opportunities_query = opp_scope.join(Lead, Opportunity.lead_id == Lead.id).filter(
                Lead.visit_log_id.in_(visit_log_ids_list),
                Opportunity.status == OpportunityStatus.WON,
            )
        else:
            won_opportunities_query = opp_scope.filter(Opportunity.id == -1)

        # 时间范围过滤
        if start_date:
            won_opportunities_query = won_opportunities_query.filter(func.date(Opportunity.created_at) >= start_date)
        if end_date:
            won_opportunities_query = won_opportunities_query.filter(func.date(Opportunity.created_at) <= end_date)
        
        won_opportunities = won_opportunities_query.count()
        conversion_rate = (won_opportunities / opportunity_count * 100) if opportunity_count > 0 else 0.0
        
        statistics.append(SalesUnitStatistics(
            sales_unit=sales_unit,
            task_count=task_count,
            work_order_count=work_order_count,
            opportunity_count=opportunity_count,
            conversion_rate=round(conversion_rate, 2)
        ))
    
    # 按任务数量排序
    statistics.sort(key=lambda x: x.task_count, reverse=True)
    
    return statistics


@router.get("/time-range", response_model=List[TimeRangeStatistics])
def get_time_range_statistics_api(
    start_date: Optional[date] = Query(None, description="开始日期"),
    end_date: Optional[date] = Query(None, description="结束日期"),
    group_by: str = Query("day", description="分组方式：day/week/month"),
    group_id: Optional[int] = Query(None, description="分组ID（仅总管可用）"),
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """获取时间段统计（基于当前激活角色）"""
    current_user, current_role = user_role
    if group_by not in ["day", "week", "month"]:
        raise HTTPException(status_code=400, detail="group_by 必须是 day、week 或 month")
    
    # 权限验证
    if group_id and current_role.role != UserRole.MANAGER:
        raise HTTPException(status_code=403, detail="只有总管可以指定分组ID")
    
    # 如果指定了group_id，验证分组是否存在
    if group_id:
        group = db.query(Group).filter(Group.id == group_id).first()
        if not group:
            raise HTTPException(status_code=404, detail="分组不存在")
    
    return get_time_range_statistics(db, current_user, current_role, start_date, end_date, group_by, group_id)


@router.get("/sales-units", response_model=List[SalesUnitStatistics])
def get_sales_unit_statistics_api(
    group_id: Optional[int] = Query(None, description="分组ID（仅总管可用）"),
    start_date: Optional[str] = Query(None, description="开始日期（YYYY-MM-DD）"),
    end_date: Optional[str] = Query(None, description="结束日期（YYYY-MM-DD）"),
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """获取销售单位统计（基于当前激活角色）"""
    current_user, current_role = user_role
    
    # 权限验证
    if group_id and current_role.role != UserRole.MANAGER:
        raise HTTPException(status_code=403, detail="只有总管可以指定分组ID")
    
    # 如果指定了group_id，验证分组是否存在
    if group_id:
        group = db.query(Group).filter(Group.id == group_id).first()
        if not group:
            raise HTTPException(status_code=404, detail="分组不存在")
    
    # 解析日期参数
    start_date_obj = None
    end_date_obj = None
    if start_date:
        try:
            start_date_obj = datetime.strptime(start_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="开始日期格式错误，应为YYYY-MM-DD")
    if end_date:
        try:
            end_date_obj = datetime.strptime(end_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="结束日期格式错误，应为YYYY-MM-DD")
    
    return get_sales_unit_statistics(db, current_user, current_role, group_id, start_date_obj, end_date_obj)


def get_sales_unit_performance_statistics(
    db: Session, 
    current_user: User, 
    current_role,
    group_id: Optional[int] = None,
    include_member_details: bool = False,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None
) -> Tuple[List[SalesUnitPerformanceStatistics], Optional[List]]:
    """获取销售单位绩效统计（基于当前激活角色）
    
    Returns:
        (统计列表, 成员明细列表)
    """
    from sqlalchemy.orm import joinedload
    
    # 确定要统计的成员ID列表
    member_ids_to_filter = None
    
    if current_role.role == UserRole.MEMBER:
        # 成员：只能看到自己的数据
        member_ids_to_filter = [current_user.id]
    elif current_role.role == UserRole.TEAM_LEADER:
        # 组长：获取组内所有成员
        member_ids_to_filter = get_user_group_members(db, current_user.id)
    elif current_role.role == UserRole.MANAGER:
        # 总管：如果指定了group_id，只统计该分组；否则统计所有
        if group_id:
            member_ids_to_filter = get_group_member_ids(db, group_id)
            if not member_ids_to_filter:
                # 如果分组没有成员，返回空结果
                return [], None
    
    # 根据当前激活角色过滤任务
    task_query = db.query(Task)
    if current_role.role == UserRole.TASK_INITIATOR:
        task_query = task_query.filter(Task.initiator_id == current_user.id)
    elif current_role.role == UserRole.SALES_CONTACT:
        # 销售单位接口人可以查看销售单位匹配的任务
        user_sales_unit = current_role.sales_unit or current_user.sales_unit
        if user_sales_unit:
            task_query = task_query.filter(Task.sales_unit.like(f"%{user_sales_unit}%"))
        else:
            task_query = task_query.filter(Task.sales_contact_id == current_user.id)
    elif current_role.role == UserRole.TEAM_LEADER:
        # 组长：通过工单的team_leader_id过滤，确保只统计创建时属于自己组的工单
        work_orders = db.query(WorkOrder).filter(
            work_orders_visible_to_team_leader_filter(db, current_user.id)
        ).all()
        task_ids = [wo.task_id for wo in work_orders]
        if task_ids:
            task_query = task_query.filter(Task.id.in_(task_ids))
        else:
            return [], None
    elif current_role.role == UserRole.MEMBER:
        # 成员：只能看到自己的工单
        work_orders = db.query(WorkOrder).filter(WorkOrder.member_id == current_user.id).all()
        task_ids = [wo.task_id for wo in work_orders]
        if task_ids:
            task_query = task_query.filter(Task.id.in_(task_ids))
        else:
            return [], None
    elif current_role.role == UserRole.MANAGER and group_id:
        # 总管按分组筛选：通过组的leader_id找到该组的组长，然后通过工单的team_leader_id过滤
        group = db.query(Group).filter(Group.id == group_id).first()
        if group and group.leader_id:
            work_orders = db.query(WorkOrder).filter(
                or_(
                    WorkOrder.team_leader_id == group.leader_id,
                    WorkOrder.dispatch_group_id == group_id,
                )
            ).all()
            task_ids = [wo.task_id for wo in work_orders]
            if task_ids:
                task_query = task_query.filter(Task.id.in_(task_ids))
            else:
                return [], None
        else:
            return [], None
    
    # 添加时间范围过滤
    if start_date:
        task_query = task_query.filter(func.date(Task.created_at) >= start_date)
    if end_date:
        task_query = task_query.filter(func.date(Task.created_at) <= end_date)
    
    # 先获取相关任务ID，用于限制需求和后续统计的范围
    related_tasks = task_query.all()
    task_ids_for_scope = [t.id for t in related_tasks]
    if not task_ids_for_scope:
        return [], None
    
    # =========================
    # 分组维度：客户来源 customer_source
    # =========================
    # 从 TaskDetailRequirement.customer_source 中提取所有非空的客户来源，作为统计维度
    customer_source_query = db.query(TaskDetailRequirement.customer_source).filter(
        TaskDetailRequirement.task_id.in_(task_ids_for_scope),
        TaskDetailRequirement.customer_source.isnot(None),
        TaskDetailRequirement.customer_source != ""
    )
    # 根据角色和组过滤需求对应的工单范围（与后续保持一致）
    # 这里只做粗粒度过滤：后面每个客户来源仍会再按角色/时间精细过滤
    customer_sources_raw = [cs[0] for cs in customer_source_query.distinct().all() if cs[0]]
    customer_source_set = set(cs.strip() for cs in customer_sources_raw if cs and cs.strip())
    
    # 如果没有任何带客户来源的需求，直接返回空结果
    if not customer_source_set:
        return [], None
    
    sales_unit_list = sorted(list(customer_source_set))
    
    statistics = []
    for sales_unit in sales_unit_list:
        # 这里的 sales_unit 实际上是“客户来源”字段的值
        
        # 1. 找到该客户来源的所有需求（限定在当前任务范围内）
        requirement_query = db.query(TaskDetailRequirement.id, TaskDetailRequirement.task_id).filter(
            TaskDetailRequirement.task_id.in_(task_ids_for_scope),
            TaskDetailRequirement.customer_source == sales_unit
        )
        requirement_rows = requirement_query.all()
        requirement_ids = [row[0] for row in requirement_rows]
        task_ids = list({row[1] for row in requirement_rows})  # 该客户来源涉及到的任务ID
        
        if not requirement_ids and not task_ids:
            # 该客户来源下没有任何有效数据，跳过
            continue
        
        perf_wo_scope = apply_work_order_statistics_scope(
            db, current_user, current_role, group_id
        )
        if requirement_ids:
            work_order_query = perf_wo_scope.filter(
                WorkOrder.detail_requirement_id.in_(requirement_ids)
            )
        else:
            work_order_query = perf_wo_scope.filter(
                WorkOrder.task_id.in_(task_ids or task_ids_for_scope),
                WorkOrder.detail_requirement_id.is_(None),
            )

        # 时间范围过滤
        if start_date:
            work_order_query = work_order_query.filter(func.date(WorkOrder.created_at) >= start_date)
        if end_date:
            work_order_query = work_order_query.filter(func.date(WorkOrder.created_at) <= end_date)
        
        work_orders = work_order_query.all()
        appointments_made = len(work_orders)
        if appointments_made == 0:
            continue
        work_order_ids = [wo.id for wo in work_orders]
        
        # 2. 已拜访 = 拜访日志数量
        visit_log_query = db.query(VisitLog).filter(VisitLog.work_order_id.in_(work_order_ids))
        if start_date:
            visit_log_query = visit_log_query.filter(func.date(VisitLog.visit_date) >= start_date)
        if end_date:
            visit_log_query = visit_log_query.filter(func.date(VisitLog.visit_date) <= end_date)
        visit_logs = visit_log_query.all()
        visits_completed = len(visit_logs)
        
        # 3. 有效预约率 = 已拜访 / 已预约
        effective_appointment_rate = (visits_completed / appointments_made * 100) if appointments_made > 0 else 0.0
        
        # 4. 有决策/建议权 = 拜访日志中拜访对象有决策/建议权的拜访日志数量
        visit_log_ids = [vl.id for vl in visit_logs]
        has_decision_authority = sum(
            1 for vl in visit_logs if visit_log_counts_as_has_authority(vl.has_decision_authority)
        )
        
        # 5. 有效拜访率 = 有决策/建议权 / 已拜访
        effective_visit_rate = (has_decision_authority / visits_completed * 100) if visits_completed > 0 else 0.0
        
        # 6. 线索数量：以拜访日志「是否有线索」为准（线索维护合并后不再依赖 leads 表是否有行）
        lead_count = sum(
            1 for vl in visit_logs if visit_log_counts_as_has_clue(vl.has_clue)
        )

        perf_opp_scope = apply_opportunity_statistics_scope(
            db, current_user, current_role, group_id
        )
        if visit_log_ids:
            lead_ids = [
                row[0]
                for row in db.query(Lead.id).filter(Lead.visit_log_id.in_(visit_log_ids)).all()
            ]
            if lead_ids:
                opportunity_query = perf_opp_scope.filter(
                    Opportunity.lead_id.in_(lead_ids)
                )
            else:
                opportunity_query = perf_opp_scope.filter(Opportunity.id == -1)
        else:
            opportunity_query = perf_opp_scope.filter(Opportunity.id == -1)
        if start_date:
            opportunity_query = opportunity_query.filter(func.date(Opportunity.created_at) >= start_date)
        if end_date:
            opportunity_query = opportunity_query.filter(func.date(Opportunity.created_at) <= end_date)
        opportunity_count = opportunity_query.count()
        
        # 8. 线索挖掘率 = 线索数量 / 有决策/建议权
        lead_mining_rate = (lead_count / has_decision_authority * 100) if has_decision_authority > 0 else 0.0
        
        # 9. 线索转化率 = 商机数量 / 线索数量
        lead_conversion_rate = (opportunity_count / lead_count * 100) if lead_count > 0 else 0.0
        
        statistics.append(SalesUnitPerformanceStatistics(
            sales_unit=sales_unit,
            appointments_made=appointments_made,
            visits_completed=visits_completed,
            effective_appointment_rate=round(effective_appointment_rate, 2),
            has_decision_authority=has_decision_authority,
            effective_visit_rate=round(effective_visit_rate, 2),
            lead_count=lead_count,
            opportunity_count=opportunity_count,
            lead_mining_rate=round(lead_mining_rate, 2),
            lead_conversion_rate=round(lead_conversion_rate, 2)
        ))
    
    # 计算总计
    if statistics:
        total_appointments = sum(s.appointments_made for s in statistics)
        total_visits = sum(s.visits_completed for s in statistics)
        total_decision_authority = sum(s.has_decision_authority for s in statistics)
        total_leads = sum(s.lead_count for s in statistics)
        total_opportunities = sum(s.opportunity_count for s in statistics)
        
        total_effective_appointment_rate = (total_visits / total_appointments * 100) if total_appointments > 0 else 0.0
        total_effective_visit_rate = (total_decision_authority / total_visits * 100) if total_visits > 0 else 0.0
        total_lead_mining_rate = (total_leads / total_decision_authority * 100) if total_decision_authority > 0 else 0.0
        total_lead_conversion_rate = (total_opportunities / total_leads * 100) if total_leads > 0 else 0.0
        
        statistics.append(SalesUnitPerformanceStatistics(
            sales_unit="总计",
            appointments_made=total_appointments,
            visits_completed=total_visits,
            effective_appointment_rate=round(total_effective_appointment_rate, 2),
            has_decision_authority=total_decision_authority,
            effective_visit_rate=round(total_effective_visit_rate, 2),
            lead_count=total_leads,
            opportunity_count=total_opportunities,
            lead_mining_rate=round(total_lead_mining_rate, 2),
            lead_conversion_rate=round(total_lead_conversion_rate, 2)
        ))
    
    # 生成成员明细统计（仅组长且include_member_details=True时）
    member_details = None
    if include_member_details and current_role.role == UserRole.TEAM_LEADER and member_ids_to_filter:
        from app.schemas.statistics import MemberDetailStatistics
        member_details = []
        for member_id in member_ids_to_filter:
            member = db.query(User).filter(User.id == member_id).first()
            if not member:
                continue

            # 获取该成员的工单（仅本组，含联席组长名下）
            member_work_order_query = db.query(WorkOrder).filter(
                WorkOrder.member_id == member_id,
                work_orders_visible_to_team_leader_filter(db, current_user.id),
            )
            if start_date:
                member_work_order_query = member_work_order_query.filter(func.date(WorkOrder.created_at) >= start_date)
            if end_date:
                member_work_order_query = member_work_order_query.filter(func.date(WorkOrder.created_at) <= end_date)
            member_work_orders = member_work_order_query.all()
            member_work_order_ids = [wo.id for wo in member_work_orders]
            member_task_ids = [wo.task_id for wo in member_work_orders]
            
            if not member_task_ids:
                continue
            
            # 获取该成员的拜访日志
            member_visit_log_query = db.query(VisitLog).filter(VisitLog.work_order_id.in_(member_work_order_ids))
            if start_date:
                member_visit_log_query = member_visit_log_query.filter(func.date(VisitLog.visit_date) >= start_date)
            if end_date:
                member_visit_log_query = member_visit_log_query.filter(func.date(VisitLog.visit_date) <= end_date)
            member_visit_logs = member_visit_log_query.all()
            member_visit_log_ids = [vl.id for vl in member_visit_logs]
            
            # 计算各项指标
            member_appointments = len(member_work_orders)
            member_visits = len(member_visit_logs)
            member_decision_authority = sum(
                1
                for vl in member_visit_logs
                if visit_log_counts_as_has_authority(vl.has_decision_authority)
            )
            member_leads = sum(
                1 for vl in member_visit_logs if visit_log_counts_as_has_clue(vl.has_clue)
            )
            member_opportunity_query = apply_opportunity_statistics_scope(
                db, current_user, current_role, group_id
            ).filter(Opportunity.task_id.in_(member_task_ids))
            if start_date:
                member_opportunity_query = member_opportunity_query.filter(func.date(Opportunity.created_at) >= start_date)
            if end_date:
                member_opportunity_query = member_opportunity_query.filter(func.date(Opportunity.created_at) <= end_date)
            member_opportunities = member_opportunity_query.count()
            
            member_effective_appointment_rate = (member_visits / member_appointments * 100) if member_appointments > 0 else 0.0
            member_effective_visit_rate = (member_decision_authority / member_visits * 100) if member_visits > 0 else 0.0
            member_lead_mining_rate = (member_leads / member_decision_authority * 100) if member_decision_authority > 0 else 0.0
            member_lead_conversion_rate = (member_opportunities / member_leads * 100) if member_leads > 0 else 0.0
            
            member_details.append(MemberDetailStatistics(
                member_id=member.id,
                member_name=member.real_name or member.username,
                appointments_made=member_appointments,
                visits_completed=member_visits,
                effective_appointment_rate=round(member_effective_appointment_rate, 2),
                has_decision_authority=member_decision_authority,
                effective_visit_rate=round(member_effective_visit_rate, 2),
                lead_count=member_leads,
                opportunity_count=member_opportunities,
                lead_mining_rate=round(member_lead_mining_rate, 2),
                lead_conversion_rate=round(member_lead_conversion_rate, 2)
            ))
    
    return statistics, member_details


def get_requirement_direction_statistics(
    db: Session, 
    current_user: User, 
    current_role,
    group_id: Optional[int] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None
) -> List[RequirementDirectionGroupStatistics]:
    """获取需求方向统计（基于当前激活角色）"""
    # 确定要统计的成员ID列表
    member_ids_to_filter = None
    
    if current_role.role == UserRole.MEMBER:
        member_ids_to_filter = [current_user.id]
    elif current_role.role == UserRole.TEAM_LEADER:
        member_ids_to_filter = get_user_group_members(db, current_user.id)
    elif current_role.role == UserRole.MANAGER and group_id:
        member_ids_to_filter = get_group_member_ids(db, group_id)
    
    # 根据当前激活角色过滤任务
    task_query = db.query(Task)
    if current_role.role == UserRole.TASK_INITIATOR:
        task_query = task_query.filter(Task.initiator_id == current_user.id)
    elif current_role.role == UserRole.SALES_CONTACT:
        user_sales_unit = current_role.sales_unit or current_user.sales_unit
        if user_sales_unit:
            task_query = task_query.filter(Task.sales_unit.like(f"%{user_sales_unit}%"))
        else:
            task_query = task_query.filter(Task.sales_contact_id == current_user.id)
    elif current_role.role == UserRole.TEAM_LEADER:
        # 组长：通过工单的team_leader_id过滤，确保只统计创建时属于自己组的工单
        work_orders = db.query(WorkOrder).filter(
            work_orders_visible_to_team_leader_filter(db, current_user.id)
        ).all()
        task_ids = [wo.task_id for wo in work_orders]
        if task_ids:
            task_query = task_query.filter(Task.id.in_(task_ids))
        else:
            return []
    elif current_role.role == UserRole.MEMBER:
        work_orders = db.query(WorkOrder).filter(WorkOrder.member_id == current_user.id).all()
        task_ids = [wo.task_id for wo in work_orders]
        if task_ids:
            task_query = task_query.filter(Task.id.in_(task_ids))
        else:
            return []
    elif current_role.role == UserRole.MANAGER and group_id:
        # 总管按组统计：通过组的leader_id找到该组的组长，然后通过工单的team_leader_id过滤
        group = db.query(Group).filter(Group.id == group_id).first()
        if group and group.leader_id:
            work_orders = db.query(WorkOrder).filter(
                or_(
                    WorkOrder.team_leader_id == group.leader_id,
                    WorkOrder.dispatch_group_id == group_id,
                )
            ).all()
            task_ids = [wo.task_id for wo in work_orders]
            if task_ids:
                task_query = task_query.filter(Task.id.in_(task_ids))
            else:
                return []
        else:
            return []
    
    # 添加时间范围过滤
    if start_date:
        task_query = task_query.filter(func.date(Task.created_at) >= start_date)
    if end_date:
        task_query = task_query.filter(func.date(Task.created_at) <= end_date)
    
    # 获取所有相关任务的线索
    task_ids = [t.id for t in task_query.all()]
    lead_query = db.query(Lead).filter(Lead.task_id.in_(task_ids))
    lead_query = apply_lead_list_role_scope(lead_query, db, current_user, current_role)
    if start_date:
        lead_query = lead_query.filter(func.date(Lead.created_at) >= start_date)
    if end_date:
        lead_query = lead_query.filter(func.date(Lead.created_at) <= end_date)
    leads = lead_query.all()
    
    # 从数据库获取需求方向分类配置
    from app.models.option_config import OptionConfig, OptionType
    
    # 获取所有启用的需求方向选项
    # 注意：option_type 现在存储为字符串，需要使用枚举的值进行比较
    option_configs = db.query(OptionConfig).filter(
        and_(
            OptionConfig.option_type == OptionType.REQUIREMENT_DIRECTION.value,
            OptionConfig.is_active == True
        )
    ).order_by(OptionConfig.sort_order, OptionConfig.id).all()
    
    # 构建分类字典：category -> [directions]
    categories: dict[str, list[str]] = {}
    
    # 遍历选项配置，构建分类结构
    for opt in option_configs:
        if opt.level == 1:
            # 一级分类
            if opt.parent_id is None:
                # 检查是否有子项
                has_children = any(child.parent_id == opt.id for child in option_configs)
                if opt.label not in categories:
                    if has_children:
                        # 有子项的分类
                        categories[opt.label] = []
                    else:
                        # 单级选项（如"定制化AI应用服务"），作为分类名，也是选项名
                        categories[opt.label] = [opt.label]
        elif opt.level == 2:
            # 二级分类，需要找到父级
            if opt.parent_id:
                parent = db.query(OptionConfig).filter(OptionConfig.id == opt.parent_id).first()
                if parent:
                    if parent.label not in categories:
                        categories[parent.label] = []
                    categories[parent.label].append(opt.label)
    
    # 将value转换为label的映射字典（用于统计时转换）
    from app.utils.requirement_direction_utils import convert_requirement_direction_value_to_label
    
    # 统计每个需求方向的数量
    # 注意：数据库中存储的格式可能是：
    # 1. 单选：字符串 "算力 - 英伟达算力" 或 "moxing - duomotaidamloking"
    # 2. 多选：JSON数组字符串 '["算力 - 国产算力", "模型 - 通用大模型"]'
    # 需要先转换为label格式，然后提取需求方向部分
    import json
    direction_counts = {}
    for lead in leads:
        direction = lead.requirement_direction
        if direction:
            # 尝试解析为JSON数组（多选格式）
            try:
                parsed = json.loads(direction)
                if isinstance(parsed, list) and len(parsed) > 0:
                    # 多选格式：对每个方向分别统计
                    for single_direction in parsed:
                        if isinstance(single_direction, str):
                            direction_display = convert_requirement_direction_value_to_label(db, single_direction)
                            # 提取需求方向部分
                            actual_direction = _extract_direction_from_display(direction_display)
                            direction_counts[actual_direction] = direction_counts.get(actual_direction, 0) + 1
                    continue
            except (json.JSONDecodeError, TypeError):
                # 不是JSON格式，按单选格式处理
                pass
            
            # 单选格式处理
            direction_display = convert_requirement_direction_value_to_label(db, direction)
            actual_direction = _extract_direction_from_display(direction_display)
            direction_counts[actual_direction] = direction_counts.get(actual_direction, 0) + 1
    
    # 按分类组织统计结果
    result = []
    for category, directions in categories.items():
        direction_stats = []
        # 如果分类下没有方向列表，使用分类名本身
        if not directions:
            # 检查是否有单级分类
            count = direction_counts.get(category, 0)
            direction_stats.append(RequirementDirectionStatistics(
                direction=category,
                count=count
            ))
        else:
            for direction in directions:
                count = direction_counts.get(direction, 0)
                direction_stats.append(RequirementDirectionStatistics(
                    direction=direction,
                    count=count
                ))
        result.append(RequirementDirectionGroupStatistics(
            category=category,
            directions=direction_stats
        ))
    
    return result


@router.get("/sales-units/performance", response_model=SalesUnitPerformanceResponse)
def get_sales_unit_performance_statistics_api(
    group_id: Optional[int] = Query(None, description="分组ID（仅总管可用）"),
    include_member_details: bool = Query(False, description="是否包含成员明细（仅组长可用）"),
    start_date: Optional[str] = Query(None, description="开始日期（YYYY-MM-DD）"),
    end_date: Optional[str] = Query(None, description="结束日期（YYYY-MM-DD）"),
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """获取销售单位绩效统计（基于当前激活角色）"""
    current_user, current_role = user_role
    
    # 权限验证
    if group_id and current_role.role != UserRole.MANAGER:
        raise HTTPException(status_code=403, detail="只有总管可以指定分组ID")
    
    if include_member_details and current_role.role != UserRole.TEAM_LEADER:
        raise HTTPException(status_code=403, detail="只有组长可以查看成员明细")
    
    # 如果指定了group_id，验证分组是否存在
    if group_id:
        group = db.query(Group).filter(Group.id == group_id).first()
        if not group:
            raise HTTPException(status_code=404, detail="分组不存在")
    
    # 解析日期参数
    start_date_obj = None
    end_date_obj = None
    if start_date:
        try:
            start_date_obj = datetime.strptime(start_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="开始日期格式错误，应为YYYY-MM-DD")
    if end_date:
        try:
            end_date_obj = datetime.strptime(end_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="结束日期格式错误，应为YYYY-MM-DD")
    
    statistics, member_details = get_sales_unit_performance_statistics(
        db, current_user, current_role, group_id, include_member_details, start_date_obj, end_date_obj
    )
    requirement_directions = get_requirement_direction_statistics(
        db, current_user, current_role, group_id, start_date_obj, end_date_obj
    )
    
    return SalesUnitPerformanceResponse(
        statistics=statistics,
        requirement_directions=requirement_directions,
        member_details=member_details
    )


def parse_amount(amount_str: Optional[str]) -> float:
    """
    解析金额字符串，提取数字部分（单位：元）
    
    支持的格式：
    - "100万" -> 1000000
    - "100万元" -> 1000000
    - "1000" -> 1000000 (纯数字默认按万元处理，因为业务规则中won_amount和expected_amount的单位是万元)
    - "1000元" -> 1000 (明确标注"元"时按元处理)
    - "1.5万" -> 15000
    
    注意：对于转定金额(won_amount)和预计金额(expected_amount)，
    数据库中存储的纯数字字符串（如"2.40"）实际单位是"万元"，
    因为用户输入时单位提示是"万元"。
    """
    if not amount_str:
        return 0.0
    
    import re
    # 移除空格和逗号
    amount_str = amount_str.replace(' ', '').replace(',', '')
    
    # 检查是否包含"元"但不包含"万"（明确标注为元）
    if '元' in amount_str and '万' not in amount_str:
        # 明确标注为"元"，按元处理
        try:
            number = float(re.sub(r'[^\d.]', '', amount_str))
            return number
        except ValueError:
            return 0.0
    
    # 匹配数字和单位
    match = re.match(r'([\d.]+)([万千])?', amount_str)
    if not match:
        # 尝试直接解析为数字
        try:
            number = float(re.sub(r'[^\d.]', '', amount_str))
            # 纯数字默认按万元处理（业务规则）
            return number * 10000
        except ValueError:
            return 0.0
    
    number = float(match.group(1))
    unit = match.group(2)
    
    if unit == '万':
        return number * 10000
    elif unit == '千':
        return number * 1000
    else:
        # 纯数字（没有单位），默认按万元处理（业务规则）
        # 因为won_amount和expected_amount在输入时单位提示是"万元"
        return number * 10000


def get_opportunity_converted_amount_statistics(
    db: Session, 
    current_user: User, 
    current_role,
    group_id: Optional[int] = None,
    include_member_details: bool = False,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None
) -> List[OpportunityConvertedAmountStatistics]:
    """
    获取转订商机总金额统计（基于当前激活角色）
    
    权限：
    - 成员：只能看到自己的转订商机总金额
    - 组长：能看到成员和组总共的转订商机总金额（include_member_details=True时显示成员明细）
    - 总管：可以看到各组和总共的转订商机总金额（group_id指定时只看该组，否则看所有组）
    """
    statistics = []
    
    # 根据角色确定查询范围
    if current_role.role == UserRole.MEMBER:
        # 成员：只能看到自己的转订商机
        # 通过Lead.member_id过滤
        query = db.query(Opportunity).join(Opportunity.lead).filter(
            Opportunity.status == OpportunityStatus.WON,
            Lead.member_id == current_user.id
        )
        
        # 添加时间范围过滤（优先使用状态变更时间，如果没有则使用创建时间）
        if start_date:
            query = query.filter(
                func.coalesce(func.date(Opportunity.status_changed_at), func.date(Opportunity.created_at)) >= start_date
            )
        if end_date:
            query = query.filter(
                func.coalesce(func.date(Opportunity.status_changed_at), func.date(Opportunity.created_at)) <= end_date
            )
        
        opportunities = query.all()
        converted_count = len(opportunities)
        total_amount = sum(parse_amount(opp.won_amount) for opp in opportunities)
        
        statistics.append(OpportunityConvertedAmountStatistics(
            member_id=current_user.id,
            member_name=current_user.real_name or current_user.username,
            converted_count=converted_count,
            total_amount=round(total_amount, 2)
        ))
        
    elif current_role.role == UserRole.TEAM_LEADER:
        # 组长：能看到成员和组总共的转订商机总金额
        # 获取组内所有成员
        member_ids = get_user_group_members(db, current_user.id)
        visible_opp_ids = _visible_opportunity_ids_for_stats(db, current_user, current_role)

        def _restrict_team_leader_won(q):
            if not visible_opp_ids:
                return q.filter(Opportunity.id == -1)
            return q.filter(Opportunity.id.in_(visible_opp_ids))

        # 如果include_member_details=True，显示成员明细
        if include_member_details:
            for member_id in member_ids:
                member = db.query(User).filter(User.id == member_id).first()
                if not member:
                    continue
                
                # 获取该成员的转订商机
                member_query = db.query(Opportunity).join(Opportunity.lead).filter(
                    Opportunity.status == OpportunityStatus.WON,
                    Lead.member_id == member_id
                )
                member_query = _restrict_team_leader_won(member_query)
                
                if start_date:
                    member_query = member_query.filter(
                        func.coalesce(func.date(Opportunity.status_changed_at), func.date(Opportunity.created_at)) >= start_date
                    )
                if end_date:
                    member_query = member_query.filter(
                        func.coalesce(func.date(Opportunity.status_changed_at), func.date(Opportunity.created_at)) <= end_date
                    )
                
                member_opportunities = member_query.all()
                member_converted_count = len(member_opportunities)
                member_total_amount = sum(parse_amount(opp.won_amount) for opp in member_opportunities)
                
                statistics.append(OpportunityConvertedAmountStatistics(
                    member_id=member.id,
                    member_name=member.real_name or member.username,
                    converted_count=member_converted_count,
                    total_amount=round(member_total_amount, 2)
                ))
        
        # 计算组总计：获取所有组内成员的转订商机
        group_query = db.query(Opportunity).join(Opportunity.lead).filter(
            Opportunity.status == OpportunityStatus.WON,
            Lead.member_id.in_(member_ids)
        )
        group_query = _restrict_team_leader_won(group_query)
        
        if start_date:
            group_query = group_query.filter(
                func.coalesce(func.date(Opportunity.status_changed_at), func.date(Opportunity.created_at)) >= start_date
            )
        if end_date:
            group_query = group_query.filter(
                func.coalesce(func.date(Opportunity.status_changed_at), func.date(Opportunity.created_at)) <= end_date
            )
        
        group_opportunities = group_query.all()
        group_converted_count = len(group_opportunities)
        group_total_amount = sum(parse_amount(opp.won_amount) for opp in group_opportunities)
        
        statistics.append(OpportunityConvertedAmountStatistics(
            member_name="组总计",
            converted_count=group_converted_count,
            total_amount=round(group_total_amount, 2)
        ))

    elif current_role.role in (UserRole.SALES_CONTACT, UserRole.TASK_INITIATOR):
        q = apply_opportunity_list_role_scope(
            db.query(Opportunity).filter(Opportunity.status == OpportunityStatus.WON),
            db,
            current_user,
            current_role,
            member_id=None,
        )
        if start_date:
            q = q.filter(
                func.coalesce(
                    func.date(Opportunity.status_changed_at),
                    func.date(Opportunity.created_at),
                )
                >= start_date
            )
        if end_date:
            q = q.filter(
                func.coalesce(
                    func.date(Opportunity.status_changed_at),
                    func.date(Opportunity.created_at),
                )
                <= end_date
            )
        opportunities = q.all()
        total_amount = sum(parse_amount(opp.won_amount) for opp in opportunities)
        statistics.append(
            OpportunityConvertedAmountStatistics(
                member_name=current_user.real_name or current_user.username,
                converted_count=len(opportunities),
                total_amount=round(total_amount, 2),
            )
        )
        
    elif current_role.role == UserRole.MANAGER:
        # 总管：可以看到各组和总共的转订商机总金额
        if group_id:
            # 指定分组：显示该分组的总计
            group = db.query(Group).filter(Group.id == group_id).first()
            if group and group.leader_id:
                member_ids = get_group_member_ids(db, group_id)
                
                group_query = db.query(Opportunity).join(Opportunity.lead).filter(
                    Opportunity.status == OpportunityStatus.WON,
                    Lead.member_id.in_(member_ids)
                )
                
                if start_date:
                    group_query = group_query.filter(
                        func.coalesce(func.date(Opportunity.status_changed_at), func.date(Opportunity.created_at)) >= start_date
                    )
                if end_date:
                    group_query = group_query.filter(
                        func.coalesce(func.date(Opportunity.status_changed_at), func.date(Opportunity.created_at)) <= end_date
                    )
                
                group_opportunities = group_query.all()
                group_converted_count = len(group_opportunities)
                group_total_amount = sum(parse_amount(opp.won_amount) for opp in group_opportunities)
                
                statistics.append(OpportunityConvertedAmountStatistics(
                    group_id=group.id,
                    group_name=group.name,
                    converted_count=group_converted_count,
                    total_amount=round(group_total_amount, 2)
                ))
        else:
            # 未指定分组：显示所有分组和总计
            all_groups = db.query(Group).all()
            
            for group in all_groups:
                member_ids = get_group_member_ids(db, group.id)
                if not member_ids:
                    continue
                
                group_query = db.query(Opportunity).join(Opportunity.lead).filter(
                    Opportunity.status == OpportunityStatus.WON,
                    Lead.member_id.in_(member_ids)
                )
                
                if start_date:
                    group_query = group_query.filter(
                        func.coalesce(func.date(Opportunity.status_changed_at), func.date(Opportunity.created_at)) >= start_date
                    )
                if end_date:
                    group_query = group_query.filter(
                        func.coalesce(func.date(Opportunity.status_changed_at), func.date(Opportunity.created_at)) <= end_date
                    )
                
                group_opportunities = group_query.all()
                group_converted_count = len(group_opportunities)
                group_total_amount = sum(parse_amount(opp.won_amount) for opp in group_opportunities)
                
                statistics.append(OpportunityConvertedAmountStatistics(
                    group_id=group.id,
                    group_name=group.name,
                    converted_count=group_converted_count,
                    total_amount=round(group_total_amount, 2)
                ))
            
            # 计算总计：所有转订商机
            total_query = db.query(Opportunity).filter(
                Opportunity.status == OpportunityStatus.WON
            )
            
            if start_date:
                total_query = total_query.filter(
                    func.coalesce(func.date(Opportunity.status_changed_at), func.date(Opportunity.created_at)) >= start_date
                )
            if end_date:
                total_query = total_query.filter(
                    func.coalesce(func.date(Opportunity.status_changed_at), func.date(Opportunity.created_at)) <= end_date
                )
            
            total_opportunities = total_query.all()
            total_converted_count = len(total_opportunities)
            total_total_amount = sum(parse_amount(opp.won_amount) for opp in total_opportunities)
            
            statistics.append(OpportunityConvertedAmountStatistics(
                group_name="总计",
                converted_count=total_converted_count,
                total_amount=round(total_total_amount, 2)
            ))
    
    return statistics


@router.get("/opportunities/converted-amount", response_model=List[OpportunityConvertedAmountStatistics])
def get_opportunity_converted_amount_statistics_api(
    group_id: Optional[int] = Query(None, description="分组ID（仅总管可用）"),
    include_member_details: bool = Query(False, description="是否包含成员明细（仅组长可用）"),
    start_date: Optional[str] = Query(None, description="开始日期（YYYY-MM-DD）"),
    end_date: Optional[str] = Query(None, description="结束日期（YYYY-MM-DD）"),
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """获取转订商机总金额统计（基于当前激活角色）"""
    current_user, current_role = user_role
    
    # 权限验证
    if group_id and current_role.role != UserRole.MANAGER:
        raise HTTPException(status_code=403, detail="只有总管可以指定分组ID")
    
    if include_member_details and current_role.role != UserRole.TEAM_LEADER:
        raise HTTPException(status_code=403, detail="只有组长可以查看成员明细")
    
    # 如果指定了group_id，验证分组是否存在
    if group_id:
        group = db.query(Group).filter(Group.id == group_id).first()
        if not group:
            raise HTTPException(status_code=404, detail="分组不存在")
    
    # 解析日期参数
    start_date_obj = None
    end_date_obj = None
    if start_date:
        try:
            start_date_obj = datetime.strptime(start_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="开始日期格式错误，应为YYYY-MM-DD")
    if end_date:
        try:
            end_date_obj = datetime.strptime(end_date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="结束日期格式错误，应为YYYY-MM-DD")
    
    return get_opportunity_converted_amount_statistics(
        db, current_user, current_role, group_id, include_member_details, start_date_obj, end_date_obj
    )
