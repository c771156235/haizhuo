"""
多组长（联席组长）数据范围：同一 FDE 组内所有组长对彼此工单子数据的可见性一致。
"""
from typing import List, Set

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models.group import Group, group_leaders


def get_peer_team_leader_ids(db: Session, user_id: int) -> List[int]:
    """
    返回与 user_id 同属至少一个 FDE 组「组长席」的所有组长用户 ID（含主组长 leader_id 与 group_leaders），
    一定包含 user_id 本人。

    若用户当前未在任何组担任组长（仅成员等），返回 [user_id]，与旧版「仅自己」行为兼容。
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
    if not groups:
        return [user_id]

    ids: Set[int] = set()
    for gid in {g.id for g in groups}:
        g_row = db.query(Group).filter(Group.id == gid).first()
        if g_row and g_row.leader_id:
            ids.add(g_row.leader_id)
        for row in db.query(group_leaders.c.user_id).filter(group_leaders.c.group_id == gid).all():
            ids.add(row[0])
    ids.add(user_id)
    return list(ids)
