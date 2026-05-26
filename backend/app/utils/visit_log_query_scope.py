"""
拜访日志列表 / 导出的数据范围：与 get_visit_logs 一致，避免导出与接口权限脱节。
"""
from sqlalchemy.orm import Session, joinedload, Query

from app.models.user import User, UserRole
from app.models.visit_log import VisitLog
from app.models.work_order import WorkOrder
from app.models.task import Task, TaskDetailRequirement
from app.utils.team_leader_peer_scope import get_peer_team_leader_ids


def visit_log_standard_loader_options():
    """列表、导出共用的 eager load（销售单位接口人应用层过滤依赖关联）。"""
    return (
        joinedload(VisitLog.work_order).joinedload(WorkOrder.task),
        joinedload(VisitLog.work_order)
        .joinedload(WorkOrder.detail_requirement)
        .joinedload(TaskDetailRequirement.sales_contact),
        joinedload(VisitLog.member),
    )


def apply_visit_log_role_scope(
    query: Query,
    db: Session,
    current_user: User,
    current_role,
) -> Query:
    """
    按当前激活角色收紧 VisitLog 查询。
    销售单位接口人分支可能对 query 整表替换（与 visit_logs API 行为一致）。
    """
    role = current_role.role

    if role == UserRole.MEMBER:
        return query.filter(VisitLog.member_id == current_user.id)

    if role == UserRole.TEAM_LEADER:
        peer_ids = get_peer_team_leader_ids(db, current_user.id)
        work_orders = (
            db.query(WorkOrder).filter(WorkOrder.team_leader_id.in_(peer_ids)).all()
        )
        work_order_ids = [wo.id for wo in work_orders]
        return query.filter(VisitLog.work_order_id.in_(work_order_ids))

    if role == UserRole.SALES_CONTACT:
        user_sales_unit = current_role.sales_unit or current_user.sales_unit
        if user_sales_unit:
            all_visit_logs = query.all()
            matched = []
            for visit_log in all_visit_logs:
                if visit_log.work_order and visit_log.work_order.detail_requirement:
                    requirement = visit_log.work_order.detail_requirement
                    if requirement.sales_contact_id == current_user.id:
                        if requirement.sales_contact:
                            contact_sales_unit = requirement.sales_contact.sales_unit
                            if contact_sales_unit == user_sales_unit:
                                matched.append(visit_log)
                            elif (
                                user_sales_unit in contact_sales_unit
                                or contact_sales_unit in user_sales_unit
                            ):
                                matched.append(visit_log)
                elif visit_log.work_order and visit_log.work_order.task:
                    task = visit_log.work_order.task
                    task_sales_units = [
                        unit.strip()
                        for unit in task.sales_unit.split(",")
                        if unit.strip()
                    ]
                    for unit in task_sales_units:
                        if (
                            unit == user_sales_unit
                            or user_sales_unit in unit
                            or unit in user_sales_unit
                        ):
                            matched.append(visit_log)
                            break
            if matched:
                visit_log_ids = [vl.id for vl in matched]
                return db.query(VisitLog).options(*visit_log_standard_loader_options()).filter(
                    VisitLog.id.in_(visit_log_ids)
                )
            return db.query(VisitLog).options(*visit_log_standard_loader_options()).filter(
                VisitLog.id == -1
            )

        work_orders = (
            db.query(WorkOrder)
            .join(TaskDetailRequirement)
            .filter(TaskDetailRequirement.sales_contact_id == current_user.id)
            .all()
        )
        work_order_ids = [wo.id for wo in work_orders]
        if work_order_ids:
            return query.filter(VisitLog.work_order_id.in_(work_order_ids))
        return query.filter(VisitLog.work_order_id == -1)

    if role == UserRole.TASK_INITIATOR:
        return query.filter(
            VisitLog.work_order.has(
                WorkOrder.task.has(Task.initiator_id == current_user.id)
            )
        )

    # MANAGER 等：不额外过滤
    return query
