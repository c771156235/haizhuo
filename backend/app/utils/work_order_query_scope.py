"""
工单列表 / 导出的数据范围：与 get_work_orders 一致。
"""
from sqlalchemy.orm import Session, joinedload, Query

from app.models.user import User, UserRole
from app.models.work_order import WorkOrder
from app.models.task import Task, TaskDetailRequirement
from app.utils.work_order_pool import work_orders_visible_to_team_leader_filter


def work_order_standard_loader_options():
    return (
        joinedload(WorkOrder.task),
        joinedload(WorkOrder.team_leader),
        joinedload(WorkOrder.member),
        joinedload(WorkOrder.dispatch_group),
        joinedload(WorkOrder.detail_requirement).joinedload(TaskDetailRequirement.sales_contact),
    )


def apply_work_order_role_scope(
    query: Query,
    db: Session,
    current_user: User,
    current_role,
) -> Query:
    """
    按当前激活角色收紧 WorkOrder 查询。
    销售单位接口人分支可能对 query 整表替换（与 work_orders API 行为一致）。
    """
    role = current_role.role

    if role == UserRole.TEAM_LEADER:
        return query.filter(
            work_orders_visible_to_team_leader_filter(db, current_user.id)
        )

    if role == UserRole.MEMBER:
        return query.filter(WorkOrder.member_id == current_user.id)

    if role == UserRole.TASK_INITIATOR:
        return query.join(Task).filter(Task.initiator_id == current_user.id)

    if role == UserRole.SALES_CONTACT:
        user_sales_unit = current_role.sales_unit or current_user.sales_unit
        if user_sales_unit:
            query = query.join(Task).filter(
                Task.sales_unit.like(f"%{user_sales_unit}%")
                | (Task.sales_unit == user_sales_unit)
            )

            all_work_orders = query.options(
                joinedload(WorkOrder.detail_requirement).joinedload(
                    TaskDetailRequirement.sales_contact
                ),
                joinedload(WorkOrder.task),
            ).all()

            matched_work_orders = []
            for work_order in all_work_orders:
                matched = False
                if work_order.detail_requirement:
                    requirement = work_order.detail_requirement
                    if requirement.sales_contact_id == current_user.id:
                        if requirement.sales_contact:
                            contact_sales_unit = requirement.sales_contact.sales_unit
                            if contact_sales_unit == user_sales_unit:
                                matched = True
                            elif (
                                user_sales_unit in contact_sales_unit
                                or contact_sales_unit in user_sales_unit
                            ):
                                matched = True
                else:
                    if work_order.task:
                        task_sales_units = [
                            unit.strip()
                            for unit in work_order.task.sales_unit.split(",")
                            if unit.strip()
                        ]
                        if "全部" in task_sales_units:
                            matched = True
                        else:
                            for unit in task_sales_units:
                                if unit == user_sales_unit:
                                    matched = True
                                    break
                                if user_sales_unit in unit:
                                    matched = True
                                    break
                                if unit in user_sales_unit:
                                    matched = True
                                    break

                if matched:
                    matched_work_orders.append(work_order)

            if matched_work_orders:
                work_order_ids = [wo.id for wo in matched_work_orders]
                return db.query(WorkOrder).options(
                    *work_order_standard_loader_options()
                ).filter(WorkOrder.id.in_(work_order_ids))
            return db.query(WorkOrder).options(*work_order_standard_loader_options()).filter(
                WorkOrder.id == -1
            )

        return query.join(TaskDetailRequirement).filter(
            TaskDetailRequirement.sales_contact_id == current_user.id
        )

    return query
