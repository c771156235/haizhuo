"""
用户管理 API
"""
import re
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User, UserRole, ApprovalStatus
from app.schemas.user import UserResponse, UserCreate, UserUpdate, UserApprovalRequest, AddUserRoleRequest
from app.schemas.common import PaginationParams, PaginatedResponse
from app.api.deps import get_current_user, get_current_role, require_manager
from app.core.security import get_password_hash, validate_password_strength
from app.core.audit import log_user_action
from app.core.user_helpers import get_user_current_role
from app.models.audit_log import AuditAction
from fastapi import Request

router = APIRouter(prefix="/users", tags=["用户管理"])


def build_user_response_dict(db: Session, user: User) -> dict:
    """构建统一的用户响应字典，避免 ORM 关系字段直接序列化导致校验错误。"""
    from app.models.user import UserRoleAssociation
    from app.schemas.user import UserRoleInfo
    from app.models.group import Group, group_leaders
    from sqlalchemy import or_

    user_roles = db.query(UserRoleAssociation).filter(
        UserRoleAssociation.user_id == user.id
    ).all()
    current_role_assoc = next((r for r in user_roles if r.is_current), None)

    leader_groups = None
    has_leader_role = any(
        r.role == UserRole.TEAM_LEADER and
        r.approval_status == ApprovalStatus.APPROVED.value and
        r.is_active
        for r in user_roles
    )
    if has_leader_role:
        groups_as_leader = db.query(Group).join(
            group_leaders, Group.id == group_leaders.c.group_id, isouter=True
        ).filter(
            or_(
                group_leaders.c.user_id == user.id,
                Group.leader_id == user.id
            )
        ).distinct().all()
        if groups_as_leader:
            leader_groups = [{"id": g.id, "name": g.name} for g in groups_as_leader]

    return {
        "id": user.id,
        "username": user.username,
        "real_name": user.real_name,
        "email": user.email,
        "phone": user.phone,
        "avatar": user.avatar,
        "is_active": user.is_active,
        "created_at": user.created_at,
        "updated_at": user.updated_at,
        "role": current_role_assoc.role if current_role_assoc else (user.role if user.role else None),
        "sales_unit": current_role_assoc.sales_unit if current_role_assoc else (user.sales_unit if user.sales_unit else None),
        "approval_status": get_user_approval_status(user, user_roles),
        "roles": [UserRoleInfo(
            id=r.id,
            role=r.role,
            sales_unit=r.sales_unit,
            is_current=r.is_current,
            is_active=r.is_active,
            approval_status=r.approval_status,
            rejection_reason=r.rejection_reason,
            approved_at=r.approved_at,
            created_at=r.created_at
        ) for r in user_roles],
        "current_role": UserRoleInfo(
            id=current_role_assoc.id,
            role=current_role_assoc.role,
            sales_unit=current_role_assoc.sales_unit,
            is_current=current_role_assoc.is_current,
            is_active=current_role_assoc.is_active,
            approval_status=current_role_assoc.approval_status,
            rejection_reason=current_role_assoc.rejection_reason,
            approved_at=current_role_assoc.approved_at,
            created_at=current_role_assoc.created_at
        ) if current_role_assoc else None,
        "leader_groups": leader_groups
    }


def get_user_approval_status(user: User, user_roles: List) -> str:
    """
    获取用户的审核状态
    如果用户有多个角色，返回最优先的状态：
    1. 如果有待审核的角色，返回pending
    2. 如果有已拒绝的角色，返回rejected
    3. 如果所有角色都已审核通过，返回approved
    """
    if not user_roles:
        # 向后兼容：如果用户表中还有approval_status字段
        return user.approval_status if hasattr(user, 'approval_status') and user.approval_status else 'approved'
    
    # 检查是否有待审核的角色
    pending_roles = [r for r in user_roles if r.approval_status == 'pending']
    if pending_roles:
        return 'pending'
    
    # 检查是否有已拒绝的角色
    rejected_roles = [r for r in user_roles if r.approval_status == 'rejected']
    if rejected_roles:
        return 'rejected'
    
    # 所有角色都已审核通过
    return 'approved'


@router.get("", response_model=PaginatedResponse[UserResponse])
def get_users(
    role: UserRole = Query(None, description="角色筛选"),
    search: Optional[str] = Query(None, description="搜索用户名或真实姓名"),
    approval_status: Optional[ApprovalStatus] = Query(None, description="审核状态筛选"),
    my_group: bool = Query(False, description="仅获取当前用户组内的成员（仅组长可用）"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(10, ge=1, le=100, description="每页数量"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取用户列表（支持分页和搜索）"""
    query = db.query(User)
    
    # 只有总管可以看到所有用户（包括禁用的和待审核的），其他角色只能看到活跃且已审核通过的用户
    current_role = get_user_current_role(current_user, db)
    if current_role != UserRole.MANAGER:
        # 对于新系统，需要检查用户是否有已审核通过的角色
        query = query.filter(User.is_active == True)
        # 注意：新系统中approval_status在UserRoleAssociation中，这里暂时保留向后兼容
    
    # 组内成员筛选：如果指定了my_group=True，只返回当前用户组内的成员（仅组长可用）
    if my_group:
        if current_role != UserRole.TEAM_LEADER:
            raise HTTPException(status_code=403, detail="只有组长可以查看组内成员")
        
        from sqlalchemy import or_
        from app.models.group import Group, group_members, group_leaders
        # 查找当前用户作为组长的组（兼容 leader_id 与 group_leaders）
        group = db.query(Group).join(
            group_leaders, Group.id == group_leaders.c.group_id, isouter=True
        ).filter(
            or_(Group.leader_id == current_user.id, group_leaders.c.user_id == current_user.id)
        ).distinct().first()
        if group:
            # 获取组内成员ID列表
            member_ids = db.query(group_members.c.user_id).filter(
                group_members.c.group_id == group.id
            ).all()
            member_id_list = [mid[0] for mid in member_ids]
            if member_id_list:
                query = query.filter(User.id.in_(member_id_list))
            else:
                # 如果组内没有成员，返回空结果
                query = query.filter(User.id == -1)  # 永远不匹配的条件
        else:
            # 如果组长没有组，返回空结果
            query = query.filter(User.id == -1)  # 永远不匹配的条件
    
    # 角色筛选：如果指定了角色，需要查找有该角色的用户
    if role:
        from app.models.user import UserRoleAssociation
        # 查找有该角色的用户ID列表
        user_ids_with_role = db.query(UserRoleAssociation.user_id).filter(
            UserRoleAssociation.role == role,
            UserRoleAssociation.approval_status == "approved",
            UserRoleAssociation.is_active == True
        ).distinct().all()
        user_ids = [uid[0] for uid in user_ids_with_role]
        if user_ids:
            query = query.filter(User.id.in_(user_ids))
        else:
            # 如果没有用户有该角色，返回空结果
            query = query.filter(User.id == -1)  # 永远不匹配的条件
    
    # 审核状态筛选（仅总管可用）
    current_role = get_user_current_role(current_user, db)
    if approval_status and current_role == UserRole.MANAGER:
        from app.models.user import UserRoleAssociation
        # 根据审核状态筛选用户
        if approval_status == ApprovalStatus.PENDING:
            # 查找有待审核角色的用户
            user_ids_with_pending = db.query(UserRoleAssociation.user_id).filter(
                UserRoleAssociation.approval_status == ApprovalStatus.PENDING.value
            ).distinct().all()
            user_ids = [uid[0] for uid in user_ids_with_pending]
            if user_ids:
                query = query.filter(User.id.in_(user_ids))
            else:
                query = query.filter(User.id == -1)
        elif approval_status == ApprovalStatus.REJECTED:
            # 查找有已拒绝角色的用户（且没有已审核通过的角色）
            user_ids_with_rejected = db.query(UserRoleAssociation.user_id).filter(
                UserRoleAssociation.approval_status == ApprovalStatus.REJECTED.value
            ).distinct().all()
            user_ids_rejected = [uid[0] for uid in user_ids_with_rejected]
            # 排除有已审核通过角色的用户
            user_ids_with_approved = db.query(UserRoleAssociation.user_id).filter(
                UserRoleAssociation.approval_status == ApprovalStatus.APPROVED.value
            ).distinct().all()
            user_ids_approved = [uid[0] for uid in user_ids_with_approved]
            user_ids = [uid for uid in user_ids_rejected if uid not in user_ids_approved]
            if user_ids:
                query = query.filter(User.id.in_(user_ids))
            else:
                query = query.filter(User.id == -1)
        elif approval_status == ApprovalStatus.APPROVED:
            # 查找有已审核通过角色的用户（且没有待审核的角色）
            user_ids_with_approved = db.query(UserRoleAssociation.user_id).filter(
                UserRoleAssociation.approval_status == ApprovalStatus.APPROVED.value
            ).distinct().all()
            user_ids_approved = [uid[0] for uid in user_ids_with_approved]
            # 排除有待审核角色的用户
            user_ids_with_pending = db.query(UserRoleAssociation.user_id).filter(
                UserRoleAssociation.approval_status == ApprovalStatus.PENDING.value
            ).distinct().all()
            user_ids_pending = [uid[0] for uid in user_ids_with_pending]
            user_ids = [uid for uid in user_ids_approved if uid not in user_ids_pending]
            if user_ids:
                query = query.filter(User.id.in_(user_ids))
            else:
                query = query.filter(User.id == -1)
    
    # 搜索功能
    if search:
        search_pattern = f"%{search}%"
        query = query.filter(
            (User.username.like(search_pattern)) |
            (User.real_name.like(search_pattern))
        )
    
    # 获取总数
    total = query.count()
    
    # 分页
    pagination = PaginationParams(page=page, page_size=page_size)
    users = query.order_by(User.created_at.desc()).offset(pagination.skip).limit(pagination.limit).all()
    
    # 为每个用户加载角色信息
    from app.models.user import UserRoleAssociation
    from app.schemas.user import UserRoleInfo
    
    users_with_roles = []
    for user in users:
        # 获取用户的所有角色
        user_roles = db.query(UserRoleAssociation).filter(
            UserRoleAssociation.user_id == user.id
        ).all()
        
        # 构建角色信息列表
        roles_info = [UserRoleInfo(
            id=r.id,
            role=r.role,
            sales_unit=r.sales_unit,
            is_current=r.is_current,
            is_active=r.is_active,
            approval_status=r.approval_status,
            rejection_reason=r.rejection_reason,
            approved_at=r.approved_at,
            created_at=r.created_at
        ) for r in user_roles]
        
        # 获取当前激活的角色
        current_role_assoc = next((r for r in user_roles if r.is_current), None)
        
        # 如果查询的是组长，获取组长所属的组信息
        leader_groups = None
        if role == UserRole.TEAM_LEADER:
            from app.models.group import Group, group_leaders
            from sqlalchemy import or_
            # 查询组长所属的组（通过 group_leaders 表或 leader_id 字段，向后兼容）
            groups_as_leader = db.query(Group).join(
                group_leaders, Group.id == group_leaders.c.group_id, isouter=True
            ).filter(
                or_(
                    group_leaders.c.user_id == user.id,
                    Group.leader_id == user.id
                )
            ).distinct().all()
            
            if groups_as_leader:
                leader_groups = [{"id": g.id, "name": g.name} for g in groups_as_leader]
        
        # 构建用户响应对象
        user_dict = {
            "id": user.id,
            "username": user.username,
            "real_name": user.real_name,
            "email": user.email,
            "phone": user.phone,
            "avatar": user.avatar,
            "is_active": user.is_active,
            "created_at": user.created_at,
            "updated_at": user.updated_at,
            "role": current_role_assoc.role if current_role_assoc else (user.role if user.role else None),
            "sales_unit": current_role_assoc.sales_unit if current_role_assoc else (user.sales_unit if user.sales_unit else None),
            "approval_status": get_user_approval_status(user, user_roles),
            "roles": roles_info,
            "current_role": UserRoleInfo(
                id=current_role_assoc.id,
                role=current_role_assoc.role,
                sales_unit=current_role_assoc.sales_unit,
                is_current=current_role_assoc.is_current,
                is_active=current_role_assoc.is_active,
                approval_status=current_role_assoc.approval_status,
                rejection_reason=current_role_assoc.rejection_reason,
                approved_at=current_role_assoc.approved_at,
                created_at=current_role_assoc.created_at
            ) if current_role_assoc else None,
            "leader_groups": leader_groups
        }
        users_with_roles.append(user_dict)
    
    return PaginatedResponse.create(users_with_roles, total, page, page_size)


@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取用户详情（包含所有角色信息）"""
    from app.models.user import UserRoleAssociation
    from app.schemas.user import UserRoleInfo
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    # 只有总管可以查看所有用户，其他角色只能查看活跃且已审核通过的用户
    current_role = get_user_current_role(current_user, db)
    if current_role != UserRole.MANAGER:
        if not user.is_active:
            raise HTTPException(status_code=403, detail="无权查看该用户")
    
    # 获取用户的所有角色
    user_roles = db.query(UserRoleAssociation).filter(
        UserRoleAssociation.user_id == user_id
    ).all()
    
    # 获取当前激活的角色
    current_role_assoc = next((r for r in user_roles if r.is_current), None)
    
    # 构建用户响应对象
    user_dict = {
        "id": user.id,
        "username": user.username,
        "real_name": user.real_name,
        "email": user.email,
        "phone": user.phone,
        "avatar": user.avatar,
        "is_active": user.is_active,
        "created_at": user.created_at,
        "updated_at": user.updated_at,
        "role": current_role_assoc.role if current_role_assoc else (user.role if user.role else None),
        "sales_unit": current_role_assoc.sales_unit if current_role_assoc else (user.sales_unit if user.sales_unit else None),
        "approval_status": get_user_approval_status(user, user_roles),
        "roles": [UserRoleInfo(
            id=r.id,
            role=r.role,
            sales_unit=r.sales_unit,
            is_current=r.is_current,
            is_active=r.is_active,
            approval_status=r.approval_status,
            rejection_reason=r.rejection_reason,
            approved_at=r.approved_at,
            created_at=r.created_at
        ) for r in user_roles],
        "current_role": UserRoleInfo(
            id=current_role_assoc.id,
            role=current_role_assoc.role,
            sales_unit=current_role_assoc.sales_unit,
            is_current=current_role_assoc.is_current,
            is_active=current_role_assoc.is_active,
            approval_status=current_role_assoc.approval_status,
            rejection_reason=current_role_assoc.rejection_reason,
            approved_at=current_role_assoc.approved_at,
            created_at=current_role_assoc.created_at
        ) if current_role_assoc else None
    }
    
    return user_dict


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    user_data: UserCreate,
    user_role: tuple = Depends(require_manager),
    db: Session = Depends(get_db)
):
    """创建用户（仅总管，支持多角色）"""
    from app.models.user import UserRoleAssociation
    from datetime import datetime
    from sqlalchemy.exc import IntegrityError
    import logging
    
    logger = logging.getLogger(__name__)
    current_user, current_role = user_role
    
    # 清理和验证必填字段
    username = user_data.username.strip() if user_data.username else ''
    real_name = user_data.real_name.strip() if user_data.real_name else ''
    password = user_data.password if user_data.password else ''
    user_role_enum = user_data.role  # Pydantic 已经验证并转换为 UserRole 枚举
    sales_unit = user_data.sales_unit.strip() if user_data.sales_unit else ''
    
    if not username:
        raise HTTPException(status_code=422, detail="用户名不能为空")
    if not real_name:
        raise HTTPException(status_code=422, detail="真实姓名不能为空")
    if not password:
        raise HTTPException(status_code=422, detail="密码不能为空")
    if not user_role_enum:
        raise HTTPException(status_code=422, detail="角色不能为空")
    
    email = user_data.email.strip() if user_data.email else ''
    phone = user_data.phone.strip() if user_data.phone else ''
    if not email:
        raise HTTPException(status_code=422, detail="邮箱不能为空")
    if not phone:
        raise HTTPException(status_code=422, detail="手机号不能为空")
    if not re.match(r"^1[3-9]\d{9}$", phone):
        raise HTTPException(status_code=422, detail="请输入有效的手机号")
    
    # 检查用户名是否已存在
    existing_user = db.query(User).filter(User.username == username).first()
    
    # 检查邮箱是否已存在（如果提供了邮箱）
    existing_email = None
    if email:
        existing_email = db.query(User).filter(User.email == email).first()
    
    # 如果用户已存在，检查是否要添加新角色
    if existing_user:
        # 验证邮箱是否匹配
        if existing_email and existing_email.id != existing_user.id:
            raise HTTPException(status_code=400, detail="邮箱已被其他用户使用")
        
        if email and existing_user.email != email:
            # 与同用户名追加角色时的邮箱校验失败：对操作者只提示「用户名已被占用」即可，避免「邮箱不匹配」在纯新建场景造成误解
            raise HTTPException(status_code=400, detail="用户名已存在，请选择其他用户名")
        
        # 用户已存在，检查该角色是否已创建
        existing_role = db.query(UserRoleAssociation).filter(
            UserRoleAssociation.user_id == existing_user.id,
            UserRoleAssociation.role == user_role_enum
        ).first()
        
        if existing_role:
            raise HTTPException(status_code=400, detail=f"该用户已经拥有{user_role_enum.value}角色")
        
        # 创建新的角色关联（超管创建的角色直接审核通过）
        new_role = UserRoleAssociation(
            user_id=existing_user.id,
            role=user_role_enum,
            sales_unit=sales_unit,
            is_current=False,  # 新角色默认不是当前角色
            is_active=True,
            approval_status=ApprovalStatus.APPROVED.value,  # 超管创建的角色直接审核通过
            approved_at=datetime.utcnow(),
            approved_by=current_user.id
        )
        
        try:
            db.add(new_role)
            db.commit()
            db.refresh(new_role)
            db.refresh(existing_user)
            
            return build_user_response_dict(db, existing_user)
        except IntegrityError as e:
            db.rollback()
            error_msg = str(e.orig) if hasattr(e, 'orig') else str(e)
            logger.error(f"IntegrityError when adding role: {error_msg}")
            # 检查是否是角色重复错误
            if 'user_id' in error_msg.lower() and 'role' in error_msg.lower() or 'idx_user_role' in error_msg.lower():
                raise HTTPException(
                    status_code=400,
                    detail=f"该用户已经拥有{user_role_enum.value}角色，请勿重复创建"
                )
            else:
                raise HTTPException(
                    status_code=400,
                    detail=f"创建角色失败：{error_msg[:100]}"
                )
    
    # 如果邮箱已被使用但用户名不同
    if existing_email:
        raise HTTPException(status_code=400, detail="邮箱已被使用")
    
    # 验证密码强度
    is_valid, error_msg = validate_password_strength(password)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)
    
    # 创建新用户（为了向后兼容数据库NOT NULL约束，同时设置role字段和创建角色关联）
    new_user = User(
        username=username,
        real_name=real_name,
        email=email if email else None,
        phone=phone if phone else None,
        password_hash=get_password_hash(password),
        role=user_role_enum,  # 向后兼容：设置role字段
        sales_unit=sales_unit,  # 向后兼容：设置sales_unit字段
        approval_status=ApprovalStatus.APPROVED.value,  # 向后兼容：设置approval_status字段
        is_active=True,
        approved_at=datetime.utcnow(),
        approved_by=current_user.id
    )
    
    try:
        db.add(new_user)
        db.flush()  # 获取用户ID
        
        # 创建角色关联（超管创建的角色直接审核通过）
        new_role = UserRoleAssociation(
            user_id=new_user.id,
            role=user_role_enum,
            sales_unit=sales_unit,
            is_current=True,  # 第一个角色设为当前角色
            is_active=True,
            approval_status=ApprovalStatus.APPROVED.value,  # 超管创建的角色直接审核通过
            approved_at=datetime.utcnow(),
            approved_by=current_user.id
        )
        db.add(new_role)
        db.commit()
        db.refresh(new_user)
        db.refresh(new_role)
        
        return build_user_response_dict(db, new_user)
    except IntegrityError as e:
        db.rollback()
        error_msg = str(e.orig) if hasattr(e, 'orig') else str(e)
        logger.error(f"IntegrityError when creating user: {error_msg}")
        # 检查是否是用户名重复错误
        if 'username' in error_msg.lower() or '1062' in error_msg or 'Duplicate entry' in error_msg:
            if 'username' in error_msg.lower():
                raise HTTPException(
                    status_code=400,
                    detail="用户名已存在，请选择其他用户名"
                )
            else:
                raise HTTPException(
                    status_code=400,
                    detail="数据冲突，可能是用户名或邮箱已被使用"
                )
        # 检查是否是邮箱重复错误
        elif 'email' in error_msg.lower():
            raise HTTPException(
                status_code=400,
                detail="邮箱已被使用"
            )
        # 检查是否是角色关联表的唯一约束错误
        elif 'user_id' in error_msg.lower() and 'role' in error_msg.lower() or 'idx_user_role' in error_msg.lower():
            raise HTTPException(
                status_code=400,
                detail=f"该用户已经拥有{user_role_enum.value}角色"
            )
        else:
            # 其他完整性错误，记录详细日志
            logger.error(f"Unknown IntegrityError: {error_msg}")
            raise HTTPException(
                status_code=400,
                detail=f"创建用户失败：{error_msg[:100]}"
            )


@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    user_data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """更新用户信息"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    # 权限检查：用户只能更新自己的信息，总管可以更新任何用户
    current_role = get_user_current_role(current_user, db)
    if current_role != UserRole.MANAGER and current_user.id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="只能更新自己的信息"
        )
    
    # 非总管用户不能修改 is_active 状态
    if current_role != UserRole.MANAGER and user_data.is_active is not None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="无权修改账户状态"
        )
    
    # 更新字段
    if user_data.real_name is not None:
        user.real_name = user_data.real_name
    if user_data.email is not None:
        # 检查邮箱是否被其他用户使用
        if user_data.email != user.email:
            existing_email = db.query(User).filter(User.email == user_data.email).first()
            if existing_email:
                raise HTTPException(status_code=400, detail="邮箱已被使用")
        user.email = user_data.email
    if user_data.phone is not None:
        user.phone = user_data.phone
    if user_data.sales_unit is not None:
        # 更新User表的sales_unit（向后兼容）
        user.sales_unit = user_data.sales_unit
        # 同时更新所有角色的sales_unit（新系统使用）
        from app.models.user import UserRoleAssociation
        user_roles = db.query(UserRoleAssociation).filter(
            UserRoleAssociation.user_id == user_id
        ).all()
        for role_assoc in user_roles:
            role_assoc.sales_unit = user_data.sales_unit
    if user_data.avatar is not None:
        user.avatar = user_data.avatar
    current_role = get_user_current_role(current_user, db)
    if user_data.is_active is not None and current_role == UserRole.MANAGER:
        user.is_active = user_data.is_active
    
    db.commit()
    db.refresh(user)
    
    # 获取用户的所有角色
    from app.models.user import UserRoleAssociation
    from app.schemas.user import UserRoleInfo
    
    user_roles = db.query(UserRoleAssociation).filter(
        UserRoleAssociation.user_id == user_id
    ).all()
    
    # 获取当前激活的角色
    current_role_assoc = next((r for r in user_roles if r.is_current), None)
    
    # 如果用户是组长，获取组长所属的组信息
    leader_groups = None
    # 检查用户是否有组长角色
    has_leader_role = any(r.role == UserRole.TEAM_LEADER and r.approval_status == ApprovalStatus.APPROVED.value and r.is_active for r in user_roles)
    if has_leader_role:
        from app.models.group import Group, group_leaders
        from sqlalchemy import or_
        # 查询组长所属的组（通过 group_leaders 表或 leader_id 字段，向后兼容）
        groups_as_leader = db.query(Group).join(
            group_leaders, Group.id == group_leaders.c.group_id, isouter=True
        ).filter(
            or_(
                group_leaders.c.user_id == user.id,
                Group.leader_id == user.id
            )
        ).distinct().all()
        
        if groups_as_leader:
            leader_groups = [{"id": g.id, "name": g.name} for g in groups_as_leader]
    
    # 构建用户响应对象
    user_dict = {
        "id": user.id,
        "username": user.username,
        "real_name": user.real_name,
        "email": user.email,
        "phone": user.phone,
        "avatar": user.avatar,
        "is_active": user.is_active,
        "created_at": user.created_at,
        "updated_at": user.updated_at,
        "role": current_role_assoc.role if current_role_assoc else (user.role if user.role else None),
        "sales_unit": current_role_assoc.sales_unit if current_role_assoc else (user.sales_unit if user.sales_unit else None),
        "approval_status": get_user_approval_status(user, user_roles),
        "roles": [UserRoleInfo(
            id=r.id,
            role=r.role,
            sales_unit=r.sales_unit,
            is_current=r.is_current,
            is_active=r.is_active,
            approval_status=r.approval_status,
            rejection_reason=r.rejection_reason,
            approved_at=r.approved_at,
            created_at=r.created_at
        ) for r in user_roles],
        "current_role": UserRoleInfo(
            id=current_role_assoc.id,
            role=current_role_assoc.role,
            sales_unit=current_role_assoc.sales_unit,
            is_current=current_role_assoc.is_current,
            is_active=current_role_assoc.is_active,
            approval_status=current_role_assoc.approval_status,
            rejection_reason=current_role_assoc.rejection_reason,
            approved_at=current_role_assoc.approved_at,
            created_at=current_role_assoc.created_at
        ) if current_role_assoc else None,
        "leader_groups": leader_groups
    }
    
    return user_dict


@router.post("/{user_id}/reset-password", response_model=UserResponse)
def reset_password(
    user_id: int,
    request: Request,
    user_role: tuple = Depends(require_manager),
    db: Session = Depends(get_db)
):
    """重置用户密码（仅总管）"""
    current_user, current_role = user_role
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    # 默认密码
    default_password = "ijnbgyb#)12"
    
    # 重置密码
    user.password_hash = get_password_hash(default_password)
    db.commit()
    db.refresh(user)
    
    # 记录操作日志
    log_user_action(
        db=db,
        user_id=current_user.id,
        action=AuditAction.RESET_PASSWORD,
        target_user_id=user_id,
        description=f"重置用户密码：{user.real_name or user.username}",
        request=request
    )
    
    return build_user_response_dict(db, user)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    request: Request,
    user_role: tuple = Depends(require_manager),
    db: Session = Depends(get_db)
):
    """删除用户（仅总管，硬删除）"""
    current_user, current_role = user_role
    from app.models.task import Task
    from app.models.work_order import WorkOrder
    from app.models.visit_log import VisitLog
    from app.models.review import Review
    from app.models.opportunity import Opportunity
    from app.models.audit_log import AuditLog
    from app.models.notification import Notification
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    # 不能删除自己
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="不能删除自己的账户")
    
    # 检查用户是否有关联数据
    related_items = []
    
    # 检查任务关联
    task_count = db.query(Task).filter(
        (Task.initiator_id == user_id) |
        (Task.manager_id == user_id) |
        (Task.sales_contact_id == user_id)
    ).count()
    if task_count > 0:
        related_items.append(f"任务({task_count}个)")
    
    # 检查工单关联
    work_order_count = db.query(WorkOrder).filter(
        (WorkOrder.team_leader_id == user_id) |
        (WorkOrder.member_id == user_id)
    ).count()
    if work_order_count > 0:
        related_items.append(f"工单({work_order_count}个)")
    
    # 检查拜访日志关联
    visit_log_count = db.query(VisitLog).filter(VisitLog.member_id == user_id).count()
    if visit_log_count > 0:
        related_items.append(f"拜访日志({visit_log_count}个)")
    
    # 检查复盘关联
    review_count = db.query(Review).filter(Review.team_leader_id == user_id).count()
    if review_count > 0:
        related_items.append(f"复盘({review_count}个)")
    
    # 检查商机关联
    opportunity_count = db.query(Opportunity).filter(Opportunity.team_leader_id == user_id).count()
    if opportunity_count > 0:
        related_items.append(f"商机({opportunity_count}个)")
    
    # 检查操作日志关联（这个可以保留，不影响删除）
    # audit_log_count = db.query(AuditLog).filter(AuditLog.user_id == user_id).count()
    
    # 检查通知关联（这个可以删除，不影响）
    # notification_count = db.query(Notification).filter(Notification.user_id == user_id).count()
    
    # 如果有关联数据，阻止删除
    if related_items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"无法删除用户：该用户存在关联数据（{', '.join(related_items)}）。请先处理相关数据后再删除，或使用禁用功能。"
        )
    
    try:
        # 记录操作日志
        log_user_action(
            db=db,
            user_id=current_user.id,
            action=AuditAction.DELETE,
            target_user_id=user_id,
            description=f"删除用户：{user.real_name or user.username}",
            request=request
        )
        
        # 删除通知（不影响业务逻辑）
        db.query(Notification).filter(Notification.user_id == user_id).delete()
        
        # 硬删除：真正从数据库中删除
        db.delete(user)
        db.commit()
    except Exception as e:
        db.rollback()
        # 如果是外键约束错误，给出更友好的提示
        error_msg = str(e).lower()
        if 'foreign key' in error_msg or 'constraint' in error_msg:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="无法删除用户：该用户存在关联数据，请先处理相关数据后再删除，或使用禁用功能。"
            )
        # 其他错误
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"删除用户失败：{str(e)}"
        )
    
    return None


@router.post("/{user_id}/approve", response_model=UserResponse)
def approve_user(
    user_id: int,
    approval_data: UserApprovalRequest,
    request: Request,
    user_role: tuple = Depends(require_manager),
    db: Session = Depends(get_db)
):
    """审核用户（仅总管）- 审核用户的所有待审核角色"""
    current_user, current_role = user_role
    from datetime import datetime
    from app.models.user import UserRoleAssociation
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    # 获取用户的所有待审核角色
    pending_roles = db.query(UserRoleAssociation).filter(
        UserRoleAssociation.user_id == user_id,
        UserRoleAssociation.approval_status == ApprovalStatus.PENDING.value
    ).all()
    
    if not pending_roles:
        # 如果没有待审核的角色，检查是否有已拒绝的角色（允许重新审核）
        rejected_roles = db.query(UserRoleAssociation).filter(
            UserRoleAssociation.user_id == user_id,
            UserRoleAssociation.approval_status == ApprovalStatus.REJECTED.value
        ).all()
        
        if not rejected_roles:
            raise HTTPException(status_code=400, detail="该用户没有待审核的角色")
        # 如果有已拒绝的角色，允许重新审核
        pending_roles = rejected_roles
    
    if approval_data.action == "approve":
        # 审核通过：审核所有待审核的角色
        approved_count = 0
        for role_assoc in pending_roles:
            role_assoc.approval_status = ApprovalStatus.APPROVED.value
            role_assoc.approved_at = datetime.utcnow()
            role_assoc.approved_by = current_user.id
            role_assoc.rejection_reason = None
            role_assoc.is_active = True
            approved_count += 1
        
        # 向后兼容：更新User表的字段
        if hasattr(user, 'approval_status'):
            user.approval_status = ApprovalStatus.APPROVED.value
            user.approved_at = datetime.utcnow()
            user.approved_by = current_user.id
            user.rejection_reason = None
            user.is_active = True
        
        # 如果这是用户的第一个角色，设置为当前角色
        existing_current = db.query(UserRoleAssociation).filter(
            UserRoleAssociation.user_id == user_id,
            UserRoleAssociation.is_current == True
        ).first()
        
        if not existing_current and pending_roles:
            # 将第一个审核通过的角色设为当前角色
            pending_roles[0].is_current = True
        
        # 记录操作日志
        from app.models.user import USER_ROLE_LABELS
        role_names = [USER_ROLE_LABELS.get(r.role, r.role.value) for r in pending_roles]
        log_user_action(
            db=db,
            user_id=current_user.id,
            action=AuditAction.UPDATE,
            target_user_id=user_id,
            description=f"审核通过用户：{user.real_name or user.username}，角色：{', '.join(role_names)}",
            request=request
        )
        
        # 提交审核操作
        db.commit()
        db.refresh(user)
        
        # 自动标记相关通知为已读（用户通过待办列表处理事项时，通知应自动标记为已读）
        try:
            from app.services.notification_service import mark_notifications_as_read_by_resource
            from app.models.notification import NotificationType
            mark_notifications_as_read_by_resource(
                db=db,
                user_id=current_user.id,
                resource_type="user",
                resource_id=user.id,
                notification_types=[NotificationType.USER_REGISTRATION_PENDING]
            )
            db.commit()  # 提交标记已读
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to mark notifications as read: {str(e)}")
        
        # 发送通知给用户：审核通过（通知失败不影响主业务）
        from app.services.notification_service import notify_user_approved
        try:
            notify_user_approved(db, user)
            db.commit()  # 提交通知
        except Exception as e:
            # 通知失败不影响主业务，只记录日志
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to send approval notification: {str(e)}")
        
    elif approval_data.action == "reject":
        # 审核拒绝：拒绝所有待审核的角色
        if not approval_data.rejection_reason:
            raise HTTPException(status_code=400, detail="拒绝时必须填写拒绝原因")
        
        rejected_count = 0
        for role_assoc in pending_roles:
            role_assoc.approval_status = ApprovalStatus.REJECTED.value
            role_assoc.rejection_reason = approval_data.rejection_reason
            role_assoc.approved_at = None
            role_assoc.approved_by = current_user.id
            role_assoc.is_active = False
            role_assoc.is_current = False  # 拒绝的角色不能是当前角色
            rejected_count += 1
        
        # 向后兼容：更新User表的字段
        if hasattr(user, 'approval_status'):
            user.approval_status = ApprovalStatus.REJECTED.value
            user.rejection_reason = approval_data.rejection_reason
            user.approved_at = None
            user.approved_by = current_user.id
            user.is_active = False
        
        # 如果拒绝的角色是当前角色，需要设置另一个已审核通过的角色为当前角色
        for role_assoc in pending_roles:
            if role_assoc.is_current:
                # 查找其他已审核通过的角色
                approved_role = db.query(UserRoleAssociation).filter(
                    UserRoleAssociation.user_id == user_id,
                    UserRoleAssociation.approval_status == ApprovalStatus.APPROVED.value,
                    UserRoleAssociation.id != role_assoc.id
                ).first()
                if approved_role:
                    approved_role.is_current = True
        
        # 记录操作日志（角色使用中文标签）
        from app.models.user import USER_ROLE_LABELS
        role_names = [USER_ROLE_LABELS.get(r.role, r.role.value) for r in pending_roles]
        log_user_action(
            db=db,
            user_id=current_user.id,
            action=AuditAction.UPDATE,
            target_user_id=user_id,
            description=f"审核拒绝用户：{user.real_name or user.username}，角色：{', '.join(role_names)}，原因：{approval_data.rejection_reason}",
            request=request
        )
        
        # 提交审核操作
        db.commit()
        db.refresh(user)
        
        # 自动标记相关通知为已读（用户通过待办列表处理事项时，通知应自动标记为已读）
        try:
            from app.services.notification_service import mark_notifications_as_read_by_resource
            from app.models.notification import NotificationType
            mark_notifications_as_read_by_resource(
                db=db,
                user_id=current_user.id,
                resource_type="user",
                resource_id=user.id,
                notification_types=[NotificationType.USER_REGISTRATION_PENDING]
            )
            db.commit()  # 提交标记已读
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to mark notifications as read: {str(e)}")
        
        # 发送通知给用户：审核拒绝（通知失败不影响主业务）
        from app.services.notification_service import notify_user_rejected
        try:
            notify_user_rejected(db, user, approval_data.rejection_reason)
            db.commit()  # 提交通知
        except Exception as e:
            # 通知失败不影响主业务，只记录日志
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to send rejection notification: {str(e)}")
    else:
        raise HTTPException(status_code=400, detail="无效的操作，action 必须是 'approve' 或 'reject'")
    
    # 返回用户信息（包含所有角色）
    from app.schemas.user import UserRoleInfo
    user_roles = db.query(UserRoleAssociation).filter(
        UserRoleAssociation.user_id == user_id
    ).all()
    
    current_role_assoc = next((r for r in user_roles if r.is_current), None)
    
    user_dict = {
        "id": user.id,
        "username": user.username,
        "real_name": user.real_name,
        "email": user.email,
        "phone": user.phone,
        "avatar": user.avatar,
        "is_active": user.is_active,
        "created_at": user.created_at,
        "updated_at": user.updated_at,
        "role": current_role_assoc.role if current_role_assoc else (user.role if user.role else None),
        "sales_unit": current_role_assoc.sales_unit if current_role_assoc else (user.sales_unit if user.sales_unit else None),
        "approval_status": get_user_approval_status(user, user_roles),
        "roles": [UserRoleInfo(
            id=r.id,
            role=r.role,
            sales_unit=r.sales_unit,
            is_current=r.is_current,
            is_active=r.is_active,
            approval_status=r.approval_status,
            rejection_reason=r.rejection_reason,
            approved_at=r.approved_at,
            created_at=r.created_at
        ) for r in user_roles],
        "current_role": UserRoleInfo(
            id=current_role_assoc.id,
            role=current_role_assoc.role,
            sales_unit=current_role_assoc.sales_unit,
            is_current=current_role_assoc.is_current,
            is_active=current_role_assoc.is_active,
            approval_status=current_role_assoc.approval_status,
            rejection_reason=current_role_assoc.rejection_reason,
            approved_at=current_role_assoc.approved_at,
            created_at=current_role_assoc.created_at
        ) if current_role_assoc else None
    }
    
    return user_dict


@router.post("/{user_id}/roles", response_model=UserResponse)
def add_user_role(
    user_id: int,
    role_data: AddUserRoleRequest,
    request: Request,
    user_role: tuple = Depends(require_manager),
    db: Session = Depends(get_db)
):
    """为已注册用户添加角色（仅总管）"""
    from app.models.user import UserRoleAssociation
    from datetime import datetime
    from sqlalchemy.exc import IntegrityError
    import logging
    
    logger = logging.getLogger(__name__)
    current_user, current_role = user_role
    
    # 检查用户是否存在
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    # 检查该角色是否已存在
    existing_role = db.query(UserRoleAssociation).filter(
        UserRoleAssociation.user_id == user_id,
        UserRoleAssociation.role == role_data.role
    ).first()
    
    if existing_role:
        raise HTTPException(
            status_code=400,
            detail=f"该用户已经拥有{role_data.role.value}角色"
        )
    
    # 确定销售单位：如果提供了则使用，否则使用用户的默认销售单位
    sales_unit = role_data.sales_unit if role_data.sales_unit else user.sales_unit
    
    # 创建新的角色关联（总管添加的角色直接审核通过）
    new_role = UserRoleAssociation(
        user_id=user_id,
        role=role_data.role,
        sales_unit=sales_unit,
        is_current=False,  # 新角色默认不是当前角色
        is_active=True,
        approval_status=ApprovalStatus.APPROVED.value,  # 总管添加的角色直接审核通过
        approved_at=datetime.utcnow(),
        approved_by=current_user.id
    )
    
    try:
        db.add(new_role)
        db.commit()
        db.refresh(new_role)
        db.refresh(user)
        
        # 记录操作日志（角色使用中文标签）
        from app.models.user import USER_ROLE_LABELS
        role_label = USER_ROLE_LABELS.get(role_data.role, role_data.role.value)
        log_user_action(
            db=db,
            user_id=current_user.id,
            action=AuditAction.UPDATE,
            target_user_id=user_id,
            description=f"为用户 {user.real_name or user.username} 添加角色：{role_label}",
            request=request
        )
        db.commit()
    except IntegrityError as e:
        db.rollback()
        error_msg = str(e.orig) if hasattr(e, 'orig') else str(e)
        logger.error(f"IntegrityError when adding role: {error_msg}")
        if 'user_id' in error_msg.lower() and 'role' in error_msg.lower() or 'idx_user_role' in error_msg.lower():
            raise HTTPException(
                status_code=400,
                detail=f"该用户已经拥有{role_data.role.value}角色，请勿重复添加"
            )
        else:
            raise HTTPException(
                status_code=400,
                detail=f"添加角色失败：{error_msg[:100]}"
            )
    
    # 返回更新后的用户信息
    user_roles = db.query(UserRoleAssociation).filter(
        UserRoleAssociation.user_id == user_id
    ).all()
    
    current_role_assoc = next((r for r in user_roles if r.is_current), None)
    
    from app.schemas.user import UserRoleInfo
    user_dict = {
        "id": user.id,
        "username": user.username,
        "real_name": user.real_name,
        "email": user.email,
        "phone": user.phone,
        "avatar": user.avatar,
        "is_active": user.is_active,
        "created_at": user.created_at,
        "updated_at": user.updated_at,
        "role": current_role_assoc.role if current_role_assoc else (user.role if user.role else None),
        "sales_unit": current_role_assoc.sales_unit if current_role_assoc else (user.sales_unit if user.sales_unit else None),
        "approval_status": get_user_approval_status(user, user_roles),
        "roles": [UserRoleInfo(
            id=r.id,
            role=r.role,
            sales_unit=r.sales_unit,
            is_current=r.is_current,
            is_active=r.is_active,
            approval_status=r.approval_status,
            rejection_reason=r.rejection_reason,
            approved_at=r.approved_at,
            created_at=r.created_at
        ) for r in user_roles],
        "current_role": UserRoleInfo(
            id=current_role_assoc.id,
            role=current_role_assoc.role,
            sales_unit=current_role_assoc.sales_unit,
            is_current=current_role_assoc.is_current,
            is_active=current_role_assoc.is_active,
            approval_status=current_role_assoc.approval_status,
            rejection_reason=current_role_assoc.rejection_reason,
            approved_at=current_role_assoc.approved_at,
            created_at=current_role_assoc.created_at
        ) if current_role_assoc else None
    }
    
    return user_dict


@router.delete("/{user_id}/roles/{role_id}", response_model=UserResponse)
def remove_user_role(
    user_id: int,
    role_id: int,
    request: Request,
    user_role: tuple = Depends(require_manager),
    db: Session = Depends(get_db)
):
    """删除用户的角色（仅总管）"""
    from app.models.user import UserRoleAssociation, USER_ROLE_LABELS

    current_user, current_role = user_role
    
    # 检查用户是否存在
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    # 检查角色是否存在
    role_assoc = db.query(UserRoleAssociation).filter(
        UserRoleAssociation.id == role_id,
        UserRoleAssociation.user_id == user_id
    ).first()
    
    if not role_assoc:
        raise HTTPException(status_code=404, detail="角色不存在")
    
    # 检查是否是当前激活的角色
    if role_assoc.is_current:
        # 检查是否还有其他已审核通过的角色
        other_roles = db.query(UserRoleAssociation).filter(
            UserRoleAssociation.user_id == user_id,
            UserRoleAssociation.id != role_id,
            UserRoleAssociation.approval_status == ApprovalStatus.APPROVED.value,
            UserRoleAssociation.is_active == True
        ).all()
        
        if not other_roles:
            raise HTTPException(
                status_code=400,
                detail="不能删除当前激活的角色，且该用户没有其他可用角色"
            )
        
        # 将另一个已审核通过的角色设为当前角色
        other_roles[0].is_current = True
    
    # 记录操作日志
    log_user_action(
        db=db,
        user_id=current_user.id,
        action=AuditAction.DELETE,
        target_user_id=user_id,
        description=f"删除用户 {user.real_name or user.username} 的角色：{USER_ROLE_LABELS.get(role_assoc.role, role_assoc.role.value)}",
        request=request
    )
    
    # 删除角色
    db.delete(role_assoc)
    db.commit()
    db.refresh(user)
    
    # 返回更新后的用户信息
    user_roles = db.query(UserRoleAssociation).filter(
        UserRoleAssociation.user_id == user_id
    ).all()
    
    current_role_assoc = next((r for r in user_roles if r.is_current), None)
    
    from app.schemas.user import UserRoleInfo
    user_dict = {
        "id": user.id,
        "username": user.username,
        "real_name": user.real_name,
        "email": user.email,
        "phone": user.phone,
        "avatar": user.avatar,
        "is_active": user.is_active,
        "created_at": user.created_at,
        "updated_at": user.updated_at,
        "role": current_role_assoc.role if current_role_assoc else (user.role if user.role else None),
        "sales_unit": current_role_assoc.sales_unit if current_role_assoc else (user.sales_unit if user.sales_unit else None),
        "approval_status": get_user_approval_status(user, user_roles),
        "roles": [UserRoleInfo(
            id=r.id,
            role=r.role,
            sales_unit=r.sales_unit,
            is_current=r.is_current,
            is_active=r.is_active,
            approval_status=r.approval_status,
            rejection_reason=r.rejection_reason,
            approved_at=r.approved_at,
            created_at=r.created_at
        ) for r in user_roles],
        "current_role": UserRoleInfo(
            id=current_role_assoc.id,
            role=current_role_assoc.role,
            sales_unit=current_role_assoc.sales_unit,
            is_current=current_role_assoc.is_current,
            is_active=current_role_assoc.is_active,
            approval_status=current_role_assoc.approval_status,
            rejection_reason=current_role_assoc.rejection_reason,
            approved_at=current_role_assoc.approved_at,
            created_at=current_role_assoc.created_at
        ) if current_role_assoc else None
    }
    
    return user_dict

