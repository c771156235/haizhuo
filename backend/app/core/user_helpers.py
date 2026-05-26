"""
用户辅助函数：用于获取用户当前角色等
"""
from typing import Optional
from sqlalchemy.orm import Session
from app.models.user import User, UserRoleAssociation, UserRole


def get_user_current_role(user: User, db: Session) -> Optional[UserRole]:
    """
    获取用户的当前激活角色（向后兼容函数）
    优先从UserRoleAssociation获取，如果没有则从User.role获取
    """
    # 先尝试从UserRoleAssociation获取
    current_role_assoc = db.query(UserRoleAssociation).filter(
        UserRoleAssociation.user_id == user.id,
        UserRoleAssociation.is_current == True,
        UserRoleAssociation.is_active == True,
        UserRoleAssociation.approval_status == "approved"
    ).first()
    
    if current_role_assoc:
        return current_role_assoc.role
    
    # 向后兼容：如果用户表中还有role字段
    if user.role:
        return user.role
    
    return None


def get_user_current_role_assoc(user: User, db: Session) -> Optional[UserRoleAssociation]:
    """
    获取用户的当前激活角色关联对象
    """
    current_role_assoc = db.query(UserRoleAssociation).filter(
        UserRoleAssociation.user_id == user.id,
        UserRoleAssociation.is_current == True,
        UserRoleAssociation.is_active == True,
        UserRoleAssociation.approval_status == "approved"
    ).first()
    
    if current_role_assoc:
        return current_role_assoc
    
    # 向后兼容：如果用户表中还有role字段
    if user.role:
        role_assoc = db.query(UserRoleAssociation).filter(
            UserRoleAssociation.user_id == user.id,
            UserRoleAssociation.role == user.role
        ).first()
        if role_assoc:
            return role_assoc
    
    return None


def get_user_sales_unit(user: User, db: Session) -> Optional[str]:
    """
    获取用户的当前销售单位（向后兼容函数）
    """
    role_assoc = get_user_current_role_assoc(user, db)
    if role_assoc and role_assoc.sales_unit:
        return role_assoc.sales_unit
    
    # 向后兼容
    if user.sales_unit:
        return user.sales_unit
    
    return None

