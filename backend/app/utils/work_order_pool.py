"""
组内待认领工单：同一条工单对组内所有有效组长可见，认领后写入 team_leader_id。
"""
from typing import List, Optional

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.models.group import Group, group_leaders
from app.models.work_order import WorkOrder, WorkOrderStatus


def get_group_ids_for_team_leader(db: Session, user_id: int) -> List[int]:
    """
    用户作为组长（含主组长、联席）所在 FDE 组的 id 列表。
    若未担任任何组组长，返回空列表。
    """
    groups = (
        db.query(Group)
        .outerjoin(group_leaders, Group.id == group_leaders.c.group_id)
        .filter(
            or_(
                Group.leader_id == user_id,
                group_leaders.c.user_id == user_id,
            )
        )
        .distinct()
        .all()
    )
    return [g.id for g in groups]


def team_leader_may_access_pool_work_order(db: Session, user_id: int, work_order: WorkOrder) -> bool:
    """待组内认领状态下，当前用户是否为该派单目标组的有效组长。"""
    if work_order.status != WorkOrderStatus.PENDING_GROUP_CLAIM.value:
        return False
    if work_order.dispatch_group_id is None:
        return False
    gids = get_group_ids_for_team_leader(db, user_id)
    return work_order.dispatch_group_id in gids


def work_orders_visible_to_team_leader_filter(db: Session, user_id: int):
    """
    组长可见工单范围：本人或联席名下工单 OR 本组「待认领」工单。
    返回 SQLAlchemy 布尔表达式，用于 query.filter(...)。
    """
    from app.utils.team_leader_peer_scope import get_peer_team_leader_ids

    peer_ids = get_peer_team_leader_ids(db, user_id)
    group_ids = get_group_ids_for_team_leader(db, user_id)
    clauses = [WorkOrder.team_leader_id.in_(peer_ids)]
    if group_ids:
        clauses.append(
            and_(
                WorkOrder.dispatch_group_id.in_(group_ids),
                WorkOrder.status == WorkOrderStatus.PENDING_GROUP_CLAIM.value,
            )
        )
    return or_(*clauses)


def resolve_dispatch_group_id_from_leader_ids(
    db: Session, valid_team_leader_ids: List[int]
) -> Optional[int]:
    """从组长列表解析目标组 ID（取第一个组长所在组）。"""
    from sqlalchemy import or_

    if not valid_team_leader_ids:
        return None
    uid = valid_team_leader_ids[0]
    group = (
        db.query(Group)
        .join(group_leaders, Group.id == group_leaders.c.group_id, isouter=True)
        .filter(
            or_(
                Group.leader_id == uid,
                group_leaders.c.user_id == uid,
            )
        )
        .distinct()
        .first()
    )
    return group.id if group else None
