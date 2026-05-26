"""
线索列表 / 导出 的数据范围：与 get_leads 一致。
"""
from sqlalchemy.orm import Query, Session

from app.models.user import User, UserRole
from app.utils.team_leader_peer_scope import get_peer_team_leader_ids
from app.models.lead import Lead
from app.models.task import Task, TaskDetailRequirement
from app.models.visit_log import VisitLog
from app.models.work_order import WorkOrder


def apply_lead_list_role_scope(
    query: Query,
    db: Session,
    current_user: User,
    current_role,
) -> Query:
    """按当前激活角色收紧 Lead 查询（不含 task_id/search 等业务筛选）。"""
    if current_role.role == UserRole.MEMBER:
        query = query.filter(Lead.member_id == current_user.id)
    elif current_role.role == UserRole.TEAM_LEADER:
        peer_ids = get_peer_team_leader_ids(db, current_user.id)
        work_orders = db.query(WorkOrder).filter(WorkOrder.team_leader_id.in_(peer_ids)).all()
        work_order_ids = [wo.id for wo in work_orders]
        if work_order_ids:
            visit_log_ids = (
                db.query(VisitLog.id).filter(VisitLog.work_order_id.in_(work_order_ids)).all()
            )
            visit_log_id_list = [vl.id for vl in visit_log_ids]
            if visit_log_id_list:
                query = query.filter(Lead.visit_log_id.in_(visit_log_id_list))
            else:
                query = query.filter(Lead.id == -1)
        else:
            query = query.filter(Lead.id == -1)
    elif current_role.role == UserRole.SALES_CONTACT:
        user_sales_unit = current_role.sales_unit or current_user.sales_unit

        if user_sales_unit:
            matching_users = db.query(User.id).filter(
                User.sales_unit.like(f"%{user_sales_unit}%")
            ).all()
            matching_user_ids = [uid[0] for uid in matching_users]

            requirement_ids = []
            if matching_user_ids:
                requirements = (
                    db.query(TaskDetailRequirement.id)
                    .filter(TaskDetailRequirement.sales_contact_id.in_(matching_user_ids))
                    .all()
                )
                requirement_ids = [rid[0] for rid in requirements]

            work_order_ids = []
            if requirement_ids:
                work_orders = (
                    db.query(WorkOrder.id)
                    .filter(WorkOrder.detail_requirement_id.in_(requirement_ids))
                    .all()
                )
                work_order_ids = [woid[0] for woid in work_orders]

            visit_log_ids = []
            if work_order_ids:
                visit_logs = (
                    db.query(VisitLog.id)
                    .filter(VisitLog.work_order_id.in_(work_order_ids))
                    .all()
                )
                visit_log_ids = [vlid[0] for vlid in visit_logs]

            if visit_log_ids:
                all_tasks = db.query(Task).all()
                matched_task_ids = []
                for task in all_tasks:
                    task_sales_units = [
                        unit.strip() for unit in task.sales_unit.split(",") if unit.strip()
                    ]
                    if "全部" in task_sales_units:
                        matched_task_ids.append(task.id)
                    else:
                        for unit in task_sales_units:
                            if (
                                user_sales_unit == unit
                                or user_sales_unit in unit
                                or unit in user_sales_unit
                            ):
                                matched_task_ids.append(task.id)
                                break

                if matched_task_ids:
                    old_work_orders = (
                        db.query(WorkOrder.id)
                        .filter(
                            WorkOrder.task_id.in_(matched_task_ids),
                            WorkOrder.detail_requirement_id.is_(None),
                        )
                        .all()
                    )
                    old_work_order_ids = [woid[0] for woid in old_work_orders]

                    if old_work_order_ids:
                        old_visit_logs = (
                            db.query(VisitLog.id)
                            .filter(VisitLog.work_order_id.in_(old_work_order_ids))
                            .all()
                        )
                        old_visit_log_ids = [vlid[0] for vlid in old_visit_logs]
                        visit_log_ids.extend(old_visit_log_ids)

                query = query.filter(Lead.visit_log_id.in_(visit_log_ids))
            else:
                query = query.filter(Lead.id == -1)
        else:
            query = query.filter(Lead.id == -1)
    elif current_role.role == UserRole.TASK_INITIATOR:
        query = query.join(Lead.task).filter(Task.initiator_id == current_user.id)

    return query
