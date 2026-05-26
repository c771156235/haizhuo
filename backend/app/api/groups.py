"""
组管理 API
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models.user import User, UserRole
from app.models.group import Group, group_members, group_leaders
from app.schemas.group import (
    GroupCreate, GroupUpdate, GroupResponse, GroupMemberAdd, GroupMemberRemove
)
from app.schemas.common import PaginationParams, PaginatedResponse
from app.api.deps import get_current_user, get_current_role, require_manager
from app.core.audit import log_group_action
from app.models.audit_log import AuditAction
from fastapi import Request

router = APIRouter(prefix="/groups", tags=["组管理"])


@router.post("", response_model=GroupResponse, status_code=status.HTTP_201_CREATED)
def create_group(
    group_data: GroupCreate,
    request: Request,
    user_role: tuple = Depends(require_manager),
    db: Session = Depends(get_db)
):
    """创建组（仅总管）"""
    current_user, current_role = user_role
    
    # 检查组名是否已存在
    existing_group = db.query(Group).filter(Group.name == group_data.name).first()
    if existing_group:
        raise HTTPException(status_code=400, detail="组名已存在")
    
    # 验证组长列表（如果指定）
    leaders = []
    if group_data.leader_ids:
        # 验证所有组长是否存在
        leaders = db.query(User).filter(User.id.in_(group_data.leader_ids)).all()
        if len(leaders) != len(group_data.leader_ids):
            raise HTTPException(status_code=404, detail="部分组长不存在")
        
        # 检查所有组长是否都是活跃的
        inactive_leaders = [l for l in leaders if not l.is_active]
        if inactive_leaders:
            leader_names = [l.real_name or l.username for l in inactive_leaders]
            raise HTTPException(status_code=400, detail=f"以下组长已被禁用：{', '.join(leader_names)}")
        
        # 检查所有用户是否都有组长角色
        from app.models.user import UserRoleAssociation
        leader_role_associations = db.query(UserRoleAssociation).filter(
            UserRoleAssociation.user_id.in_(group_data.leader_ids),
            UserRoleAssociation.role == UserRole.TEAM_LEADER,
            UserRoleAssociation.approval_status == "approved",
            UserRoleAssociation.is_active == True
        ).all()
        
        leader_ids_with_role = {lra.user_id for lra in leader_role_associations}
        invalid_leaders = [l for l in leaders if l.id not in leader_ids_with_role]
        if invalid_leaders:
            leader_names = [l.real_name or l.username for l in invalid_leaders]
            raise HTTPException(status_code=400, detail=f"以下用户不是组长或组长角色未审核通过：{', '.join(leader_names)}")
        
        # 检查组长是否已经在其他组中担任组长
        existing_leader_groups = db.query(group_leaders).filter(
            group_leaders.c.user_id.in_(group_data.leader_ids)
        ).all()
        if existing_leader_groups:
            leader_ids_in_groups = {gl.user_id for gl in existing_leader_groups}
            conflicting_leaders = [l for l in leaders if l.id in leader_ids_in_groups]
            leader_names = [l.real_name or l.username for l in conflicting_leaders]
            # 获取冲突组长所在的组名
            conflicting_group_ids = {gl.group_id for gl in existing_leader_groups if gl.user_id in leader_ids_in_groups}
            conflicting_groups = db.query(Group).filter(Group.id.in_(conflicting_group_ids)).all()
            group_names = [g.name for g in conflicting_groups]
            raise HTTPException(
                status_code=400,
                detail=f"以下组长已属于其他组（{', '.join(group_names)}），无法重复添加：{', '.join(leader_names)}。组长只能属于一个组，请先将组长从原组移除，再添加到新组。"
            )
    
    # 创建组
    # 设置主组长为第一个组长（向后兼容）
    primary_leader_id = group_data.leader_ids[0] if group_data.leader_ids else None
    group = Group(
        name=group_data.name,
        description=group_data.description,
        leader_id=primary_leader_id
    )
    db.add(group)
    db.flush()  # 获取group.id
    
    # 添加所有组长到组
    if leaders:
        for leader in leaders:
            group.leaders.append(leader)
    
    # 添加成员
    if group_data.member_ids:
        # 验证所有成员
        members = db.query(User).filter(User.id.in_(group_data.member_ids)).all()
        if len(members) != len(group_data.member_ids):
            raise HTTPException(status_code=404, detail="部分成员不存在")
        
        # 检查成员是否都是活跃的
        inactive_members = [m for m in members if not m.is_active]
        if inactive_members:
            raise HTTPException(status_code=400, detail="部分成员已被禁用")
        
        # 添加成员到组（允许成员加入多个组，跳过已经在当前组的成员）
        for member in members:
            if member not in group.members:
                group.members.append(member)
    
    db.commit()
    db.refresh(group)
    
    # 重新加载关联数据
    group = db.query(Group).options(
        joinedload(Group.leader),
        joinedload(Group.members)
    ).filter(Group.id == group.id).first()
    
    # 记录操作日志
    log_group_action(
        db=db,
        user_id=current_user.id,
        action=AuditAction.CREATE,
        group_id=group.id,
        description=f"创建组：{group.name}",
        request=request
    )
    
    return GroupResponse.from_orm_with_relations(group)


@router.get("", response_model=PaginatedResponse[GroupResponse])
def get_groups(
    search: Optional[str] = Query(None, description="搜索组名"),
    my_group: bool = Query(False, description="仅获取当前用户作为组长的组（仅组长可用）"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(10, ge=1, le=100, description="每页数量"),
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """获取组列表（总管可查看所有组，组长可查看自己作为组长的组，支持分页和搜索）"""
    current_user, current_role = user_role
    
    query = db.query(Group).options(
        joinedload(Group.leader),
        joinedload(Group.leaders),
        joinedload(Group.members)
    )
    
    # 权限控制：总管可以查看所有组，组长只能查看自己作为组长的组
    if current_role.role == UserRole.MANAGER:
        # 总管可以查看所有组，忽略my_group参数
        pass
    elif current_role.role == UserRole.TEAM_LEADER:
        # 组长只能查看自己作为组长的组（通过 leader_id 或 group_leaders 关联表）
        from sqlalchemy import or_
        # 需要通过 join 来查询 group_leaders 表
        query = query.join(group_leaders, Group.id == group_leaders.c.group_id, isouter=True).filter(
            or_(
                Group.leader_id == current_user.id,
                group_leaders.c.user_id == current_user.id
            )
        ).distinct()
    else:
        # 其他角色无权查看组列表
        raise HTTPException(status_code=403, detail="需要总管或组长权限")
    
    # 搜索功能
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(Group.name.like(search_pattern))
    
    # 获取总数
    total = query.count()
    
    # 分页
    pagination = PaginationParams(page=page, page_size=page_size)
    groups = query.order_by(Group.created_at.desc()).offset(pagination.skip).limit(pagination.limit).all()
    
    # 转换为响应对象
    group_responses = [GroupResponse.from_orm_with_relations(g) for g in groups]
    
    return PaginatedResponse.create(group_responses, total, page, page_size)


@router.get("/{group_id}", response_model=GroupResponse)
def get_group(
    group_id: int,
    user_role: tuple = Depends(require_manager),
    db: Session = Depends(get_db)
):
    """获取组详情（仅总管）"""
    group = db.query(Group).options(
        joinedload(Group.leader),
        joinedload(Group.leaders),
        joinedload(Group.members)
    ).filter(Group.id == group_id).first()
    
    if not group:
        raise HTTPException(status_code=404, detail="组不存在")
    
    return GroupResponse.from_orm_with_relations(group)


@router.put("/{group_id}", response_model=GroupResponse)
def update_group(
    group_id: int,
    group_data: GroupUpdate,
    request: Request,
    user_role: tuple = Depends(require_manager),
    db: Session = Depends(get_db)
):
    """更新组信息（仅总管）"""
    current_user, current_role = user_role
    
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="组不存在")
    
    # 更新组名（如果提供且不同）
    if group_data.name is not None and group_data.name != group.name:
        # 检查新组名是否已存在
        existing_group = db.query(Group).filter(
            Group.name == group_data.name,
            Group.id != group_id
        ).first()
        if existing_group:
            raise HTTPException(status_code=400, detail="组名已存在")
        group.name = group_data.name
    
    # 更新描述
    if group_data.description is not None:
        group.description = group_data.description
    
    # 更新组长列表
    if group_data.leader_ids is not None:
        if len(group_data.leader_ids) == 0:
            # 空列表表示移除所有组长
            group.leader_id = None
            group.leaders.clear()
        else:
            # 验证所有组长是否存在
            leaders = db.query(User).filter(User.id.in_(group_data.leader_ids)).all()
            if len(leaders) != len(group_data.leader_ids):
                raise HTTPException(status_code=404, detail="部分组长不存在")
            
            # 检查所有组长是否都是活跃的
            inactive_leaders = [l for l in leaders if not l.is_active]
            if inactive_leaders:
                leader_names = [l.real_name or l.username for l in inactive_leaders]
                raise HTTPException(status_code=400, detail=f"以下组长已被禁用：{', '.join(leader_names)}")
            
            # 检查所有用户是否都有组长角色
            from app.models.user import UserRoleAssociation
            leader_role_associations = db.query(UserRoleAssociation).filter(
                UserRoleAssociation.user_id.in_(group_data.leader_ids),
                UserRoleAssociation.role == UserRole.TEAM_LEADER,
                UserRoleAssociation.approval_status == "approved",
                UserRoleAssociation.is_active == True
            ).all()
            
            leader_ids_with_role = {lra.user_id for lra in leader_role_associations}
            invalid_leaders = [l for l in leaders if l.id not in leader_ids_with_role]
            if invalid_leaders:
                leader_names = [l.real_name or l.username for l in invalid_leaders]
                raise HTTPException(status_code=400, detail=f"以下用户不是组长或组长角色未审核通过：{', '.join(leader_names)}")
            
            # 检查新组长是否已经在其他组中担任组长（排除当前组）
            existing_leader_groups = db.query(group_leaders).filter(
                group_leaders.c.user_id.in_(group_data.leader_ids),
                group_leaders.c.group_id != group_id
            ).all()
            if existing_leader_groups:
                leader_ids_in_other_groups = {gl.user_id for gl in existing_leader_groups}
                conflicting_leaders = [l for l in leaders if l.id in leader_ids_in_other_groups]
                leader_names = [l.real_name or l.username for l in conflicting_leaders]
                # 获取冲突组长所在的组名
                conflicting_group_ids = {gl.group_id for gl in existing_leader_groups if gl.user_id in leader_ids_in_other_groups}
                conflicting_groups = db.query(Group).filter(Group.id.in_(conflicting_group_ids)).all()
                group_names = [g.name for g in conflicting_groups]
                raise HTTPException(
                    status_code=400,
                    detail=f"以下组长已属于其他组（{', '.join(group_names)}），无法重复添加：{', '.join(leader_names)}。组长只能属于一个组，请先将组长从原组移除，再添加到新组。"
                )
            
            # 更新组长列表
            group.leaders.clear()
            for leader in leaders:
                group.leaders.append(leader)
            
            # 设置主组长为第一个组长（向后兼容）
            group.leader_id = group_data.leader_ids[0]
    
    db.commit()
    db.refresh(group)
    
    # 重新加载关联数据
    group = db.query(Group).options(
        joinedload(Group.leader),
        joinedload(Group.leaders),
        joinedload(Group.members)
    ).filter(Group.id == group.id).first()
    
    # 记录操作日志
    log_group_action(
        db=db,
        user_id=current_user.id,
        action=AuditAction.UPDATE,
        group_id=group.id,
        description=f"更新组：{group.name}",
        request=request
    )
    
    return GroupResponse.from_orm_with_relations(group)


@router.delete("/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_group(
    group_id: int,
    request: Request,
    user_role: tuple = Depends(require_manager),
    db: Session = Depends(get_db)
):
    """删除组（仅总管）"""
    current_user, current_role = user_role
    
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="组不存在")
    
    group_name = group.name
    
    # 检查是否有未完成的工单（如果组长有组，检查该组长的工单）
    if group.leader_id:
        from app.models.work_order import WorkOrder, WorkOrderStatus
        unfinished_work_orders = db.query(WorkOrder).filter(
            WorkOrder.team_leader_id == group.leader_id,
            WorkOrder.status.notin_([
                WorkOrderStatus.COMPLETED.value,
                WorkOrderStatus.CANCELLED.value
            ])
        ).count()
        
        if unfinished_work_orders > 0:
            raise HTTPException(
                status_code=400,
                detail=f"该组组长有 {unfinished_work_orders} 个未完成的工单，无法删除组。请先完成或取消所有工单后再删除。"
            )
    
    # 记录操作日志（在删除之前记录）
    log_group_action(
        db=db,
        user_id=current_user.id,
        action=AuditAction.DELETE,
        group_id=group_id,
        description=f"删除组：{group_name}",
        request=request
    )
    
    # 删除组（级联删除组成员关联）
    db.delete(group)
    db.commit()
    
    return None


@router.post("/{group_id}/members", response_model=GroupResponse)
def add_group_members(
    group_id: int,
    member_data: GroupMemberAdd,
    request: Request,
    user_role: tuple = Depends(require_manager),
    db: Session = Depends(get_db)
):
    """添加组成员（仅总管）"""
    current_user, current_role = user_role
    
    group = db.query(Group).options(
        joinedload(Group.members),
        joinedload(Group.leaders)
    ).filter(Group.id == group_id).first()
    
    if not group:
        raise HTTPException(status_code=404, detail="组不存在")
    
    # 验证所有成员
    members = db.query(User).filter(User.id.in_(member_data.user_ids)).all()
    if len(members) != len(member_data.user_ids):
        raise HTTPException(status_code=404, detail="部分成员不存在")
    
    # 检查成员是否都是活跃的
    inactive_members = [m for m in members if not m.is_active]
    if inactive_members:
        raise HTTPException(status_code=400, detail="部分成员已被禁用")
    
    # 添加成员到组（允许成员加入多个组，避免在当前组中重复）
    added_count = 0
    for member in members:
        if member not in group.members:
            group.members.append(member)
            added_count += 1
    
    db.commit()
    db.refresh(group)
    
    # 重新加载关联数据
    group = db.query(Group).options(
        joinedload(Group.leader),
        joinedload(Group.leaders),
        joinedload(Group.members)
    ).filter(Group.id == group.id).first()
    
    # 记录操作日志
    log_group_action(
        db=db,
        user_id=current_user.id,
        action=AuditAction.UPDATE,
        group_id=group.id,
        description=f"向组 {group.name} 添加 {added_count} 个成员",
        request=request
    )
    
    return GroupResponse.from_orm_with_relations(group)


@router.delete("/{group_id}/members", response_model=GroupResponse)
def remove_group_members(
    group_id: int,
    member_data: GroupMemberRemove,
    request: Request,
    user_role: tuple = Depends(require_manager),
    db: Session = Depends(get_db)
):
    """移除组成员（仅总管）"""
    current_user, current_role = user_role
    
    group = db.query(Group).options(
        joinedload(Group.members),
        joinedload(Group.leaders)
    ).filter(Group.id == group_id).first()
    
    if not group:
        raise HTTPException(status_code=404, detail="组不存在")
    
    # 验证所有成员
    members = db.query(User).filter(User.id.in_(member_data.user_ids)).all()
    
    # 移除成员（如果成员是组长，也需要从组长列表中移除）
    removed_count = 0
    for member in members:
        if member in group.members:
            # 如果成员是组长，也需要从组长列表中移除
            if hasattr(group, 'leaders') and member in group.leaders:
                group.leaders.remove(member)
            # 如果成员是主组长，清除主组长
            if group.leader_id == member.id:
                group.leader_id = None
                # 如果还有其他组长，设置第一个为主组长
                if hasattr(group, 'leaders') and group.leaders:
                    group.leader_id = group.leaders[0].id
            group.members.remove(member)
            removed_count += 1
    
    db.commit()
    db.refresh(group)
    
    # 重新加载关联数据
    group = db.query(Group).options(
        joinedload(Group.leader),
        joinedload(Group.leaders),
        joinedload(Group.members)
    ).filter(Group.id == group.id).first()
    
    # 记录操作日志
    log_group_action(
        db=db,
        user_id=current_user.id,
        action=AuditAction.UPDATE,
        group_id=group.id,
        description=f"从组 {group.name} 移除 {removed_count} 个成员",
        request=request
    )
    
    return GroupResponse.from_orm_with_relations(group)


@router.get("/{group_id}/members", response_model=List[dict])
def get_group_members(
    group_id: int,
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """获取组成员列表（总管可查看所有组，组长只能查看自己组的成员）"""
    current_user, current_role = user_role
    
    group = db.query(Group).options(
        joinedload(Group.members),
        joinedload(Group.leaders)
    ).filter(Group.id == group_id).first()
    
    if not group:
        raise HTTPException(status_code=404, detail="组不存在")
    
    # 权限控制：总管可以查看所有组，组长只能查看自己作为组长的组
    if current_role.role == UserRole.MANAGER:
        # 总管可以查看所有组
        pass
    elif current_role.role == UserRole.TEAM_LEADER:
        # 组长只能查看自己作为组长的组（检查 leader_id 或 group_leaders 关联表）
        is_leader = (group.leader_id == current_user.id) or (
            current_user.id in [l.id for l in group.leaders] if hasattr(group, 'leaders') and group.leaders else False
        )
        if not is_leader:
            raise HTTPException(status_code=403, detail="无权查看此组的成员")
    else:
        # 其他角色无权查看组成员
        raise HTTPException(status_code=403, detail="需要总管或组长权限")
    
    members = []
    for member in group.members:
        members.append({
            "id": member.id,
            "username": member.username,
            "real_name": member.real_name,
            "email": member.email,
            "phone": member.phone
        })
    
    return members


@router.get("/me/my-group", response_model=Optional[GroupResponse])
def get_my_group(
    user_role: tuple = Depends(get_current_role),
    db: Session = Depends(get_db)
):
    """获取当前用户所属的组信息（成员和组长可用）
    
    如果用户尚未被分配到任何组，返回 null（200 状态码），而不是 404。
    这样前端可以优雅地处理未分组的情况，避免显示错误信息。
    """
    current_user, current_role = user_role
    
    # 查找用户所属的组（作为成员或组长）
    # 1. 先查找用户作为组长的组（通过 leader_id 或 group_leaders 关联表）
    from sqlalchemy import or_
    group = db.query(Group).options(
        joinedload(Group.leader),
        joinedload(Group.leaders),
        joinedload(Group.members)
    ).join(group_leaders, Group.id == group_leaders.c.group_id, isouter=True).filter(
        or_(
            Group.leader_id == current_user.id,
            group_leaders.c.user_id == current_user.id
        )
    ).distinct().first()
    
    # 2. 如果用户不是组长，查找用户作为成员的组
    if not group:
        from app.models.group import group_members
        # 通过关联表查找用户所属的组
        member_group_ids = db.query(group_members.c.group_id).filter(
            group_members.c.user_id == current_user.id
        ).all()
        
        if member_group_ids:
            group_id = member_group_ids[0][0]  # 获取第一个组的ID
            group = db.query(Group).options(
                joinedload(Group.leader),
                joinedload(Group.leaders),
                joinedload(Group.members)
            ).filter(Group.id == group_id).first()
    
    # 如果用户没有组，返回 null（200 状态码），而不是抛出 404
    # 这样前端可以优雅地处理未分组的情况
    if not group:
        return None
    
    return GroupResponse.from_orm_with_relations(group)
