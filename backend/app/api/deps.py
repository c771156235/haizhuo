"""
依赖注入：用于获取当前用户、数据库会话等
"""
from typing import Generator, Optional, Tuple
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User, UserRole, UserRoleAssociation
from app.core.security import decode_access_token
from app.core.permissions import check_role_permission

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    """获取当前登录用户"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无法验证凭据",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception
    
    username: str = payload.get("sub")
    if username is None:
        raise credentials_exception
    
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise credentials_exception
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="用户已被禁用"
        )
    
    return user


def get_current_role(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> Tuple[User, UserRoleAssociation]:
    """
    获取当前登录用户和当前激活的角色
    返回: (用户对象, 当前角色关联对象)
    """
    user = get_current_user(token, db)
    
    # 从token中获取当前角色ID
    payload = decode_access_token(token)
    role_id = payload.get("role_id")
    
    if role_id:
        # 使用token中的角色ID
        current_role = db.query(UserRoleAssociation).filter(
            UserRoleAssociation.id == role_id,
            UserRoleAssociation.user_id == user.id,
            UserRoleAssociation.is_current == True,
            UserRoleAssociation.is_active == True,
            UserRoleAssociation.approval_status == "approved"
        ).first()
        
        if current_role:
            return user, current_role
    
    # 如果没有role_id或找不到，尝试获取当前激活的角色
    current_role = db.query(UserRoleAssociation).filter(
        UserRoleAssociation.user_id == user.id,
        UserRoleAssociation.is_current == True,
        UserRoleAssociation.is_active == True,
        UserRoleAssociation.approval_status == "approved"
    ).first()
    
    if current_role:
        return user, current_role
    
    # 如果还是没有，检查是否有已审核通过的角色（向后兼容）
    approved_role = db.query(UserRoleAssociation).filter(
        UserRoleAssociation.user_id == user.id,
        UserRoleAssociation.is_active == True,
        UserRoleAssociation.approval_status == "approved"
    ).first()
    
    if approved_role:
        # 自动设置为当前角色
        # 先取消其他角色的当前状态
        db.query(UserRoleAssociation).filter(
            UserRoleAssociation.user_id == user.id,
            UserRoleAssociation.is_current == True
        ).update({"is_current": False})
        approved_role.is_current = True
        db.commit()
        db.refresh(approved_role)
        return user, approved_role
    
    # 向后兼容：如果用户表中还有role字段（迁移期间）
    if user.role:
        # 尝试查找对应的角色关联
        role_assoc = db.query(UserRoleAssociation).filter(
            UserRoleAssociation.user_id == user.id,
            UserRoleAssociation.role == user.role
        ).first()
        
        if role_assoc:
            return user, role_assoc
    
    # 如果都没有，返回错误
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="您没有已激活的角色，请联系管理员"
    )


def require_role(*allowed_roles: UserRole):
    """要求特定角色的装饰器"""
    def role_checker(
        user_role: Tuple[User, UserRoleAssociation] = Depends(get_current_role)
    ) -> Tuple[User, UserRoleAssociation]:
        user, current_role = user_role
        if not check_role_permission(current_role.role, list(allowed_roles)):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"需要以下角色之一: {', '.join([r.value for r in allowed_roles])}"
            )
        return user, current_role
    return role_checker


def require_manager(
    user_role: Tuple[User, UserRoleAssociation] = Depends(get_current_role)
) -> Tuple[User, UserRoleAssociation]:
    """要求总管角色的快捷函数"""
    user, current_role = user_role
    if current_role.role != UserRole.MANAGER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要总管权限"
        )
    return user, current_role

