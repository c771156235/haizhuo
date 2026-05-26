"""
工作流引擎：管理任务状态流转
"""
from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from app.models.task import Task, TaskStatus
from app.models.work_order import WorkOrder, WorkOrderStatus
from app.models.opportunity import Opportunity, OpportunityStatus
from app.models.user import UserRole


class WorkflowError(Exception):
    """工作流异常"""
    pass


def first_active_work_order_for_detail_requirement(
    db: Session, detail_requirement_id: int
) -> Optional[WorkOrder]:
    """该详细需求下第一条未取消的工单；若无则 None（已取消工单不计入「已派单」）。"""
    return (
        db.query(WorkOrder)
        .filter(
            WorkOrder.detail_requirement_id == detail_requirement_id,
            WorkOrder.status != WorkOrderStatus.CANCELLED.value,
        )
        .first()
    )


def confirm_task(db: Session, task: Task, manager_id: int, sales_contact_id: int = None) -> Task:
    """总管确认任务"""
    if task.status != TaskStatus.PENDING:
        raise WorkflowError(f"任务状态为 {task.status}，无法确认")
    
    task.status = TaskStatus.CONFIRMED
    task.manager_id = manager_id
    # 不再设置单个sales_contact_id，因为任务会派发给多个销售单位接口人
    # 保留sales_contact_id字段用于兼容性，但不强制设置
    if sales_contact_id:
        task.sales_contact_id = sales_contact_id
    task.confirmed_at = datetime.utcnow()
    # 不在这里提交事务，让调用方统一管理事务
    # 使用flush确保对象状态更新，但不提交事务
    db.flush()
    return task


def reject_task(db: Session, task: Task, manager_id: int, reason: str) -> Task:
    """总管拒绝任务"""
    if task.status != TaskStatus.PENDING:
        raise WorkflowError(f"任务状态为 {task.status}，无法拒绝")
    
    task.status = TaskStatus.REJECTED
    task.manager_id = manager_id
    task.rejection_reason = reason
    # 不在这里提交事务，让调用方统一管理事务
    # 使用flush确保对象状态更新，但不提交事务
    db.flush()
    return task


def close_task(db: Session, task: Task, manager_id: int, reason: str = None) -> Task:
    """总管关闭任务"""
    # 不允许关闭已经关闭或已完成的任务
    if task.status in (TaskStatus.CANCELLED, TaskStatus.COMPLETED):
        raise WorkflowError(f"任务状态为 {task.status}，无法关闭")
    
    task.status = TaskStatus.CANCELLED
    task.manager_id = manager_id
    # 如果提供了关闭原因，保存到 rejection_reason 字段（或可以新增 close_reason 字段）
    if reason:
        task.rejection_reason = reason
    # 不在这里提交事务，让调用方统一管理事务
    # 使用flush确保对象状态更新，但不提交事务
    db.flush()
    return task


def revoke_task(db: Session, task: Task) -> Task:
    """撤回任务（创建者撤回已发起的任务）"""
    from app.models.work_order import WorkOrder, WorkOrderStatus
    
    # 只允许撤回 PENDING 或 CONFIRMED 状态的任务
    # PENDING：总管还没审批
    # CONFIRMED：总管已确认，但还没有派单（审批完成前）
    allowed_statuses = [
        TaskStatus.PENDING,
        TaskStatus.CONFIRMED
    ]
    if task.status not in allowed_statuses:
        raise WorkflowError(
            f"任务状态为 {task.status}，无法撤回。只有待确认或已确认状态的任务才能撤回"
        )
    
    # 检查是否有工单已派单（如果有工单，不允许撤回，因为已经有业务数据）
    # 注意：如果任务修改后回退到 PENDING，即使有详细需求，只要没有工单，也应该允许撤回
    work_orders = db.query(WorkOrder).filter(
        WorkOrder.task_id == task.id,
        WorkOrder.status != WorkOrderStatus.CANCELLED.value
    ).all()
    
    if work_orders:
        raise WorkflowError(
            "任务已有工单派单，无法撤回。如需修改，请联系总管处理。"
        )
    
    # 如果状态是 PENDING 且有详细需求但没有工单，说明是修改后回退的情况，允许撤回
    # 如果状态是 CONFIRMED 且有详细需求但没有工单，也允许撤回（详细需求可以重新提交）
    
    # 撤回操作：重置状态为草稿
    task.status = TaskStatus.DRAFT
    # 清空总管相关字段
    task.manager_id = None
    task.confirmed_at = None
    # 清空拒绝原因（如果有）
    task.rejection_reason = None
    # 注意：不清空 detail_submitted_at，因为详细需求仍然存在，只是任务回退到草稿状态
    # 如果用户需要删除详细需求，需要单独处理
    
    # 不在这里提交事务，让调用方统一管理事务
    # 使用flush确保对象状态更新，但不提交事务
    db.flush()
    return task


def submit_detail_requirement(db: Session, task: Task, sales_contact_id: int) -> Task:
    """销售接口人提交详细需求单（允许在关闭前随时提交）"""
    # 仅已关闭任务不可再提交；已完成任务可继续提交新需求（多阶段专项任务）
    if task.status == TaskStatus.CANCELLED:
        raise WorkflowError(f"任务状态为 {task.status}，无法提交详细需求。任务已关闭")

    # 已完成：本阶段工单已全部拜访后仍可追加需求，回退到已确认以待新一轮派单
    if task.status == TaskStatus.COMPLETED:
        task.status = TaskStatus.CONFIRMED

    # 只记录首次提交时间（如果还没有记录过）
    if not task.detail_submitted_at:
        task.detail_submitted_at = datetime.utcnow()

    # 如果任务状态是 DISPATCHED，提交新的详细需求后，状态应该变回 CONFIRMED
    # 因为新提交的详细需求肯定还没有派单，所以现在又有未派单的详细需求了
    if task.status == TaskStatus.DISPATCHED:
        task.status = TaskStatus.CONFIRMED
    
    # 注意：如果任务状态是 IN_PROGRESS，保持状态不变
    # 因为已有工单在执行中，新需求等待派单，不影响现有工单的执行
    
    # 不再设置单个 sales_contact_id，因为多个销售单位接口人都可以提交
    # 不在这里提交事务，让调用方统一管理事务
    # 使用flush确保对象状态更新，但不提交事务
    db.flush()
    return task


def check_and_update_task_dispatch_status(db: Session, task: Task) -> Task:
    """检查所有详细需求是否都已派单，如果是则更新任务状态为 DISPATCHED"""
    # 获取任务的所有详细需求
    detail_requirements = task.detail_requirements
    
    if not detail_requirements:
        # 如果没有详细需求，保持当前状态
        return task
    
    # 检查每个详细需求是否都有对应的工单
    all_dispatched = True
    for req in detail_requirements:
        if not first_active_work_order_for_detail_requirement(db, req.id):
            all_dispatched = False
            break
    
    # 如果所有详细需求都已派单，更新任务状态
    # 允许在 CONFIRMED 或 DETAIL_SUBMITTED 状态下检查
    if all_dispatched and task.status in (TaskStatus.CONFIRMED, TaskStatus.DETAIL_SUBMITTED):
        task.status = TaskStatus.DISPATCHED
        # 不在这里提交事务，让调用方统一管理事务
        # 使用flush确保对象状态更新，但不提交事务
        db.flush()
    
    return task


def accept_work_order(db: Session, work_order: WorkOrder, member_id: int) -> WorkOrder:
    """成员接单"""
    if work_order.status != WorkOrderStatus.PENDING_ACCEPT.value:
        raise WorkflowError(f"工单状态为 {work_order.status}，无法接单。只有待接单状态的工单才能接单")
    
    work_order.status = WorkOrderStatus.ACCEPTED.value
    work_order.member_id = member_id
    work_order.accepted_at = datetime.utcnow()
    
    # 更新任务状态
    if work_order.task.status == TaskStatus.DISPATCHED:
        work_order.task.status = TaskStatus.IN_PROGRESS
    
    # 不在这里提交事务，让调用方统一管理事务
    # 使用flush确保对象状态更新，但不提交事务
    db.flush()
    return work_order


def check_and_update_task_completion_status(db: Session, task: Task) -> Task:
    """检查任务的所有工单是否都已拜访，如果是则更新任务状态为 COMPLETED"""
    from app.models.task import TaskDetailRequirement
    from app.models.work_order import WorkOrder, WorkOrderStatus

    # 若存在详细需求记录：必须每条都有有效工单，否则不应标为「任务已完成」（避免尚有未派单需求却已完成）
    detail_reqs = (
        db.query(TaskDetailRequirement)
        .filter(TaskDetailRequirement.task_id == task.id)
        .all()
    )
    if detail_reqs:
        for req in detail_reqs:
            if not first_active_work_order_for_detail_requirement(db, req.id):
                return task

    # 获取任务的所有工单（不包括已取消的）
    work_orders = db.query(WorkOrder).filter(
        WorkOrder.task_id == task.id,
        WorkOrder.status != WorkOrderStatus.CANCELLED.value
    ).all()

    if not work_orders:
        # 如果没有工单，保持当前状态
        return task

    # 检查是否所有工单都已拜访
    all_completed = True
    for wo in work_orders:
        if wo.status != WorkOrderStatus.COMPLETED.value:
            all_completed = False
            break
    
    # 如果所有工单都已拜访，且任务状态是 DISPATCHED 或 IN_PROGRESS，更新为 COMPLETED
    if all_completed and task.status in (TaskStatus.DISPATCHED, TaskStatus.IN_PROGRESS):
        task.status = TaskStatus.COMPLETED
        # 不在这里提交事务，让调用方统一管理事务
        # 使用flush确保对象状态更新，但不提交事务
        db.flush()
    
    return task


def check_and_update_task_status_after_work_order_cancellation(db: Session, task: Task) -> Task:
    """工单取消后，检查任务状态是否需要更新"""
    from app.models.work_order import WorkOrder, WorkOrderStatus
    
    # 获取任务的所有工单（不包括已取消的）
    work_orders = db.query(WorkOrder).filter(
        WorkOrder.task_id == task.id,
        WorkOrder.status != WorkOrderStatus.CANCELLED.value
    ).all()
    
    # 如果所有工单都被取消，且任务状态是 IN_PROGRESS，应该回退到 DISPATCHED
    if not work_orders and task.status == TaskStatus.IN_PROGRESS:
        # 检查是否还有未派单的详细需求
        detail_requirements = task.detail_requirements
        has_undispatched = False
        for req in detail_requirements:
            if not first_active_work_order_for_detail_requirement(db, req.id):
                has_undispatched = True
                break
        
        # 如果有未派单的详细需求，回退到 CONFIRMED 或 DETAIL_SUBMITTED
        if has_undispatched:
            if task.detail_submitted_at:
                task.status = TaskStatus.DETAIL_SUBMITTED
            else:
                task.status = TaskStatus.CONFIRMED
        else:
            # 如果没有未派单的详细需求，回退到 DISPATCHED
            task.status = TaskStatus.DISPATCHED
        
        # 不在这里提交事务，让调用方统一管理事务
        # 使用flush确保对象状态更新，但不提交事务
        db.flush()
    
    return task


def check_and_update_task_status_after_detail_deletion(db: Session, task: Task) -> Task:
    """删除详细需求后，检查任务状态是否需要更新"""
    # 获取任务的所有详细需求
    detail_requirements = task.detail_requirements
    
    if not detail_requirements:
        # 如果没有详细需求，且任务状态是 DISPATCHED，应该回退到 CONFIRMED
        if task.status == TaskStatus.DISPATCHED:
            task.status = TaskStatus.CONFIRMED
            db.flush()
        return task
    
    # 检查是否还有未派单的详细需求
    has_undispatched = False
    for req in detail_requirements:
        if not first_active_work_order_for_detail_requirement(db, req.id):
            has_undispatched = True
            break
    
    # 如果还有未派单的详细需求，且任务状态是 DISPATCHED，应该回退到 CONFIRMED 或 DETAIL_SUBMITTED
    if has_undispatched and task.status == TaskStatus.DISPATCHED:
        # 如果任务有 detail_submitted_at，说明之前提交过详细需求，使用 DETAIL_SUBMITTED
        # 否则使用 CONFIRMED
        if task.detail_submitted_at:
            task.status = TaskStatus.DETAIL_SUBMITTED
        else:
            task.status = TaskStatus.CONFIRMED
        # 不在这里提交事务，让调用方统一管理事务
        # 使用flush确保对象状态更新，但不提交事务
        db.flush()
    
    return task


def update_opportunity_status(
    db: Session, 
    opportunity: Opportunity, 
    status: OpportunityStatus,
    lost_reason: str = None,
    won_amount: str = None
) -> Opportunity:
    """更新商机状态"""
    if status == OpportunityStatus.LOST and not lost_reason:
        raise WorkflowError("流失状态必须提供流失原因")
    
    opportunity.status = status
    opportunity.status_changed_at = datetime.utcnow()
    
    if status == OpportunityStatus.LOST:
        opportunity.lost_reason = lost_reason
    elif status == OpportunityStatus.WON:
        opportunity.won_amount = won_amount
    
    # 不在这里提交事务，让调用方统一管理事务
    # 使用flush确保对象状态更新，但不提交事务
    db.flush()
    return opportunity

