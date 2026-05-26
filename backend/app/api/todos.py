"""
待办事项管理 API
"""
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, and_
from datetime import datetime, date, timedelta
from app.database import get_db
from app.models.user import User, UserRole, UserRoleAssociation, ApprovalStatus
from app.models.task import Task, TaskStatus, TaskDetailRequirement
from app.models.work_order import WorkOrder, WorkOrderStatus
from app.models.opportunity import Opportunity, OpportunityStatus
from app.schemas.todo import TodoItem, TodoStatistics, TodoListResponse
from app.api.deps import get_current_user, get_current_role
from app.models.lead import Lead
from app.models.visit_log import VisitLog
from app.utils.team_leader_peer_scope import get_peer_team_leader_ids
from app.utils.work_order_pool import work_orders_visible_to_team_leader_filter

router = APIRouter(prefix="/todos", tags=["待办事项"])


def get_todos_for_user(
    current_user: User,
    current_role: UserRoleAssociation,
    db: Session,
    type_filter: Optional[str] = None,
    action_type_filter: Optional[str] = None,
    priority_filter: Optional[str] = None,
    overdue_only: Optional[bool] = None,
    search: Optional[str] = None
) -> List[TodoItem]:
    """获取用户的待办事项列表"""
    todos: List[TodoItem] = []
    now = datetime.now().date()
    
    # 1. 获取待确认任务
    if not type_filter or type_filter == "task":
        pending_tasks_query = db.query(Task).filter(Task.status == TaskStatus.PENDING)
        
        # 根据角色过滤任务
        if current_role.role == UserRole.MANAGER:
            # 总管需要确认任务
            pass  # 总管可以看到所有待确认任务
        elif current_role.role == UserRole.TASK_INITIATOR:
            # 专项任务发起人看到自己发起的任务，等待总管确认
            pending_tasks_query = pending_tasks_query.filter(Task.initiator_id == current_user.id)
        elif current_role.role == UserRole.SALES_CONTACT:
            # 销售单位接口人看到自己销售单位的任务，等待总管确认
            user_sales_unit = current_role.sales_unit or current_user.sales_unit
            if user_sales_unit:
                all_tasks = pending_tasks_query.all()
                matched_tasks = []
                for task in all_tasks:
                    task_sales_units = [unit.strip() for unit in task.sales_unit.split(',') if unit.strip()]
                    matched = False
                    for unit in task_sales_units:
                        if unit == user_sales_unit or user_sales_unit in unit or unit in user_sales_unit:
                            matched = True
                            break
                    if matched:
                        matched_tasks.append(task)
                if matched_tasks:
                    task_ids = [task.id for task in matched_tasks]
                    pending_tasks_query = db.query(Task).filter(Task.id.in_(task_ids))
                else:
                    pending_tasks_query = db.query(Task).filter(Task.id == -1)
        else:
            # 其他角色不显示待确认任务
            pending_tasks_query = db.query(Task).filter(Task.id == -1)
        
        pending_tasks = pending_tasks_query.all()
        
        for task in pending_tasks:
            # 根据角色判断操作类型
            action_type: Optional[str] = None
            if current_role.role == UserRole.MANAGER:
                action_type = "confirm"
            elif current_role.role in [UserRole.TASK_INITIATOR, UserRole.SALES_CONTACT]:
                action_type = "waiting"
            
            # 应用过滤条件
            if action_type_filter and action_type != action_type_filter:
                continue
            
            is_overdue = task.end_date and now > task.end_date
            if overdue_only and not is_overdue:
                continue
            
            priority = "high" if is_overdue else "medium"
            if priority_filter and priority != priority_filter:
                continue
            
            if search and search.lower() not in task.task_name.lower() and search.lower() not in (task.sales_unit or "").lower():
                continue
            
            todos.append(TodoItem(
                id=task.id,
                type="task",
                priority=priority,
                title=f"待确认任务：{task.task_name}",
                description=f"销售单位：{task.sales_unit}",
                due_date=task.end_date,
                is_overdue=is_overdue,
                link=f"/tasks/{task.id}",
                action_type=action_type,
                sales_unit=task.sales_unit,
                resource_id=task.id
            ))
        
        # 获取待提交详细需求的任务
        confirmed_tasks_query = db.query(Task).filter(Task.status == TaskStatus.CONFIRMED)
        
        # 根据角色过滤任务
        if current_role.role == UserRole.TASK_INITIATOR:
            confirmed_tasks_query = confirmed_tasks_query.filter(Task.initiator_id == current_user.id)
        elif current_role.role == UserRole.SALES_CONTACT:
            user_sales_unit = current_role.sales_unit or current_user.sales_unit
            if user_sales_unit:
                all_tasks = confirmed_tasks_query.all()
                matched_tasks = []
                for task in all_tasks:
                    task_sales_units = [unit.strip() for unit in task.sales_unit.split(',') if unit.strip()]
                    matched = False
                    for unit in task_sales_units:
                        if unit == user_sales_unit or user_sales_unit in unit or unit in user_sales_unit:
                            matched = True
                            break
                    if matched:
                        matched_tasks.append(task)
                if matched_tasks:
                    task_ids = [task.id for task in matched_tasks]
                    confirmed_tasks_query = db.query(Task).filter(Task.id.in_(task_ids))
                else:
                    confirmed_tasks_query = db.query(Task).filter(Task.id == -1)
        else:
            confirmed_tasks_query = db.query(Task).filter(Task.id == -1)
        
        confirmed_tasks = confirmed_tasks_query.all()
        
        for task in confirmed_tasks:
            action_type = "submit" if current_role.role in [UserRole.TASK_INITIATOR, UserRole.SALES_CONTACT] else None
            
            if action_type_filter and action_type != action_type_filter:
                continue
            
            is_overdue = task.end_date and now > task.end_date
            if overdue_only and not is_overdue:
                continue
            
            priority = "high" if is_overdue else "medium"
            if priority_filter and priority != priority_filter:
                continue
            
            if search and search.lower() not in task.task_name.lower() and search.lower() not in (task.sales_unit or "").lower():
                continue
            
            todos.append(TodoItem(
                id=task.id + 10000,  # 避免ID冲突
                type="task",
                priority=priority,
                title=f"待提交详细需求：{task.task_name}",
                description=f"销售单位：{task.sales_unit}",
                due_date=task.end_date,
                is_overdue=is_overdue,
                link=f"/tasks/{task.id}",
                action_type=action_type,
                sales_unit=task.sales_unit,
                resource_id=task.id
            ))
        
        # 获取待派单的任务（有详细需求但未派单）- 仅总管可见
        if current_role.role == UserRole.MANAGER:
            from sqlalchemy import exists
            
            # 一次性获取所有已派单的详细需求ID（有对应工单的详细需求）
            dispatched_detail_requirement_ids = set(
                db.query(WorkOrder.detail_requirement_id).filter(
                    WorkOrder.detail_requirement_id.isnot(None),
                    WorkOrder.status != WorkOrderStatus.CANCELLED.value,
                ).distinct().all()
            )
            dispatched_detail_requirement_ids = {row[0] for row in dispatched_detail_requirement_ids}
            
            # 查询所有有详细需求的任务（排除已关闭和已完成的任务）
            tasks_with_details_query = db.query(Task).filter(
                Task.status.notin_([TaskStatus.CANCELLED, TaskStatus.COMPLETED]),
                exists().where(TaskDetailRequirement.task_id == Task.id)
            )
            
            # 查询有未派单详细需求的任务
            # 任务有详细需求，但至少有一个详细需求还没有派单
            all_tasks_with_details = tasks_with_details_query.options(
                joinedload(Task.detail_requirements)
            ).all()
            
            for task in all_tasks_with_details:
                # 检查该任务是否有未派单的详细需求
                unassigned_count = 0
                for detail_req in task.detail_requirements:
                    # 检查该详细需求是否已派单（是否在已派单的详细需求ID集合中）
                    if detail_req.id not in dispatched_detail_requirement_ids:
                        unassigned_count += 1
                
                # 如果没有未派单的详细需求，跳过该任务
                if unassigned_count == 0:
                    continue
                
                action_type = "assign"  # 总管需要派单
                
                if action_type_filter and action_type != action_type_filter:
                    continue
                
                is_overdue = task.end_date and now > task.end_date
                if overdue_only and not is_overdue:
                    continue
                
                priority = "high" if is_overdue else "medium"
                if priority_filter and priority != priority_filter:
                    continue
                
                if search and search.lower() not in task.task_name.lower() and search.lower() not in (task.sales_unit or "").lower():
                    continue
                
                todos.append(TodoItem(
                    id=task.id + 15000,  # 避免ID冲突（10000是待提交详细需求，15000是待派单）
                    type="task",
                    priority=priority,
                    title=f"待派单任务：{task.task_name}",
                    description=f"销售单位：{task.sales_unit}，有 {unassigned_count} 个详细需求待派单",
                    due_date=task.end_date,
                    is_overdue=is_overdue,
                    link=f"/tasks/{task.id}",
                    action_type=action_type,
                    sales_unit=task.sales_unit,
                    resource_id=task.id
                ))
    
    # 2. 获取待接单工单
    if not type_filter or type_filter == "work_order":
        # 兼容旧状态 PENDING
        pending_statuses = [
            WorkOrderStatus.PENDING_GROUP_CLAIM.value,
            WorkOrderStatus.PENDING_ASSIGN.value,
            WorkOrderStatus.PENDING_ACCEPT.value,
            WorkOrderStatus.PENDING.value,  # 兼容旧数据
        ]
        pending_work_orders_query = db.query(WorkOrder).filter(
            WorkOrder.status.in_(pending_statuses)
        )
        
        # 根据角色过滤工单
        if current_role.role == UserRole.TEAM_LEADER:
            pending_work_orders_query = pending_work_orders_query.filter(
                work_orders_visible_to_team_leader_filter(db, current_user.id)
            )
        elif current_role.role == UserRole.MEMBER:
            # 成员可以看到转派给自己的工单（需要接单）
            pending_work_orders_query = pending_work_orders_query.filter(WorkOrder.member_id == current_user.id)
        else:
            # 其他角色不显示工单待办
            pending_work_orders_query = db.query(WorkOrder).filter(WorkOrder.id == -1)
        
        pending_work_orders = pending_work_orders_query.options(
            joinedload(WorkOrder.task)
        ).all()
        
        for work_order in pending_work_orders:
            # 判断操作类型：待认领 → assign（前端展示为认领）；待转派 → assign；待接单 → accept
            action_type = "assign" if work_order.member_id is None else "accept"
            
            if action_type_filter and action_type != action_type_filter:
                continue
            
            if priority_filter and priority_filter != "high":
                continue
            
            task_name = work_order.task.task_name if work_order.task else f"任务ID：{work_order.task_id}"
            if search and search.lower() not in work_order.work_order_no.lower() and search.lower() not in task_name.lower():
                continue

            if work_order.status == WorkOrderStatus.PENDING_GROUP_CLAIM.value:
                wo_action_label = "认领"
            elif action_type == "assign":
                wo_action_label = "转派"
            else:
                wo_action_label = "接单"
            
            todos.append(TodoItem(
                id=work_order.id + 20000,
                type="work_order",
                priority="high",
                title=f"待{wo_action_label}工单：{work_order.work_order_no}",
                description=task_name,
                due_date=None,
                is_overdue=False,
                link=f"/work-orders/{work_order.id}",
                action_type=action_type,
                sales_unit=work_order.task.sales_unit if work_order.task else None,
                resource_id=work_order.id
            ))
    
    # 3. 获取需要跟进的商机
    if not type_filter or type_filter == "opportunity":
        in_progress_opportunities_query = db.query(Opportunity).filter(
            Opportunity.status == OpportunityStatus.IN_PROGRESS
        )
        
        # 根据角色过滤商机
        if current_role.role == UserRole.TEAM_LEADER:
            peer_ids = get_peer_team_leader_ids(db, current_user.id)
            in_progress_opportunities_query = (
                in_progress_opportunities_query.join(Opportunity.lead)
                .join(Lead.visit_log)
                .join(VisitLog.work_order)
                .filter(
                    or_(
                        Opportunity.team_leader_id.in_(peer_ids),
                        WorkOrder.team_leader_id.in_(peer_ids),
                    )
                )
                .distinct()
            )
        elif current_role.role == UserRole.MEMBER:
            # 成员可以看到协作的商机
            from app.models.opportunity import CollaborativeMember
            collaborative_opportunity_ids = db.query(CollaborativeMember.opportunity_id).filter(
                CollaborativeMember.member_id == current_user.id
            ).subquery()
            in_progress_opportunities_query = in_progress_opportunities_query.filter(
                Opportunity.id.in_(collaborative_opportunity_ids)
            )
        else:
            in_progress_opportunities_query = db.query(Opportunity).filter(Opportunity.id == -1)
        
        in_progress_opportunities = in_progress_opportunities_query.all()
        
        for opportunity in in_progress_opportunities:
            days_since_update = (now - opportunity.updated_at.date()).days if opportunity.updated_at else 0
            
            # 如果商机超过7天未更新，标记为需要跟进
            if days_since_update < 7:
                continue
            
            is_overdue = days_since_update >= 14
            if overdue_only and not is_overdue:
                continue
            
            priority = "high" if is_overdue else "medium"
            if priority_filter and priority != priority_filter:
                continue
            
            if search and search.lower() not in opportunity.customer_unit.lower() and search.lower() not in opportunity.opportunity_no.lower():
                continue
            
            todos.append(TodoItem(
                id=opportunity.id + 30000,
                type="opportunity",
                priority=priority,
                title=f"需要跟进商机：{opportunity.customer_unit}",
                description=f"{days_since_update}天未更新 - {opportunity.opportunity_no}",
                due_date=None,
                is_overdue=is_overdue,
                link=f"/opportunities/{opportunity.id}",
                action_type=None,
                sales_unit=None,
                resource_id=opportunity.id
            ))
    
    # 4. 获取待审核用户（仅总管可见）
    if not type_filter or type_filter == "user":
        if current_role.role == UserRole.MANAGER:
            # 查询所有有待审核角色的用户
            # 使用子查询获取至少有一个待审核角色的用户ID
            pending_user_ids = db.query(UserRoleAssociation.user_id).filter(
                UserRoleAssociation.approval_status == ApprovalStatus.PENDING.value
            ).distinct().subquery()
            
            # 获取这些用户的基本信息
            pending_users_query = db.query(User).filter(
                User.id.in_(db.query(pending_user_ids.c.user_id))
            )
            
            # 应用搜索过滤
            if search:
                pending_users_query = pending_users_query.filter(
                    or_(
                        User.username.ilike(f"%{search}%"),
                        User.real_name.ilike(f"%{search}%")
                    )
                )
            
            pending_users = pending_users_query.all()
            
            for user in pending_users:
                # 获取该用户的待审核角色列表
                pending_roles = db.query(UserRoleAssociation).filter(
                    UserRoleAssociation.user_id == user.id,
                    UserRoleAssociation.approval_status == ApprovalStatus.PENDING.value
                ).all()
                
                if not pending_roles:
                    continue
                
                # 计算注册时间（天数）
                registration_days = (now - user.created_at.date()).days if user.created_at else 0
                
                # 如果注册超过3天未审核，标记为高优先级和逾期
                is_overdue = registration_days >= 3
                priority = "high" if is_overdue else "medium"
                
                # 应用过滤条件
                if action_type_filter and action_type_filter != "approve":
                    continue
                
                if overdue_only and not is_overdue:
                    continue
                
                if priority_filter and priority != priority_filter:
                    continue
                
                # 构建角色描述
                role_names = [r.role.value for r in pending_roles]
                role_description = f"待审核角色：{', '.join(role_names)}"
                if registration_days > 0:
                    role_description += f"（已注册{registration_days}天）"
                
                todos.append(TodoItem(
                    id=user.id + 40000,  # 避免ID冲突
                    type="user",
                    priority=priority,
                    title=f"待审核用户：{user.real_name or user.username}",
                    description=role_description,
                    due_date=None,
                    is_overdue=is_overdue,
                    link=f"/users?approval_status=pending",
                    action_type="approve",
                    sales_unit=None,
                    resource_id=user.id
                ))
        else:
            # 其他角色不显示用户审核待办
            pass
    
    # 按优先级和是否逾期排序
    todos.sort(key=lambda x: (
        0 if x.is_overdue else 1,  # 逾期优先
        {"high": 0, "medium": 1, "low": 2}[x.priority],  # 高优先级优先
        0 if x.due_date else 1  # 有截止日期的优先
    ))
    
    return todos


@router.get("", response_model=TodoListResponse)
def get_todos(
    type_filter: Optional[str] = Query(None, description="类型筛选：task, work_order, opportunity, user"),
    action_type_filter: Optional[str] = Query(None, description="操作类型筛选：assign, accept, confirm, submit, waiting, approve"),
    priority_filter: Optional[str] = Query(None, description="优先级筛选：high, medium, low"),
    overdue_only: Optional[bool] = Query(None, description="仅显示逾期"),
    search: Optional[str] = Query(None, description="搜索关键词"),
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """获取当前用户的待办事项列表"""
    current_user, current_role = user_role
    
    todos = get_todos_for_user(
        current_user=current_user,
        current_role=current_role,
        db=db,
        type_filter=type_filter,
        action_type_filter=action_type_filter,
        priority_filter=priority_filter,
        overdue_only=overdue_only,
        search=search
    )
    
    # 计算统计信息
    statistics = TodoStatistics(
        total=len(todos),
        overdue=sum(1 for t in todos if t.is_overdue),
        high_priority=sum(1 for t in todos if t.priority == "high"),
        by_type={
            "task": sum(1 for t in todos if t.type == "task"),
            "work_order": sum(1 for t in todos if t.type == "work_order"),
            "opportunity": sum(1 for t in todos if t.type == "opportunity"),
            "user": sum(1 for t in todos if t.type == "user"),
        },
        by_action_type={
            "assign": sum(1 for t in todos if t.action_type == "assign"),
            "accept": sum(1 for t in todos if t.action_type == "accept"),
            "confirm": sum(1 for t in todos if t.action_type == "confirm"),
            "submit": sum(1 for t in todos if t.action_type == "submit"),
            "waiting": sum(1 for t in todos if t.action_type == "waiting"),
            "approve": sum(1 for t in todos if t.action_type == "approve"),
        }
    )
    
    return TodoListResponse(
        items=todos,
        statistics=statistics,
        total=len(todos)
    )

