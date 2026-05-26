"""
用户相关的 Pydantic 模式
"""
from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from app.models.user import UserRole, ApprovalStatus


class UserRoleInfo(BaseModel):
    """用户角色信息"""
    id: int
    role: UserRole
    sales_unit: Optional[str] = None
    is_current: bool
    is_active: bool
    approval_status: str
    rejection_reason: Optional[str] = None
    approved_at: Optional[datetime] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class UserBase(BaseModel):
    """用户基础模式"""
    username: str
    real_name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    avatar: Optional[str] = None


class UserCreate(UserBase):
    """创建用户模式（超管创建，直接激活）"""
    password: str
    role: UserRole  # 角色（必填）
    sales_unit: Optional[str] = None  # 销售单位（可选）
    email: EmailStr  # 覆盖 UserBase：总管创建用户时必填
    phone: str  # 覆盖 UserBase：总管创建用户时必填


class UserRegister(BaseModel):
    """用户注册模式（公开注册，需要审核）"""
    username: str
    real_name: str
    email: EmailStr  # 必填
    phone: str  # 必填
    password: str
    role: Optional[UserRole] = UserRole.MEMBER  # 注册用户默认角色为成员
    sales_unit: str  # 必填


class UserUpdate(BaseModel):
    """更新用户模式"""
    real_name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    sales_unit: Optional[str] = None
    avatar: Optional[str] = None
    is_active: Optional[bool] = None


class UserInDB(UserBase):
    """数据库中的用户模式"""
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class UserResponse(UserInDB):
    """用户响应模式（不包含密码）"""
    # 当前激活的角色（向后兼容）
    role: Optional[UserRole] = None
    sales_unit: Optional[str] = None
    approval_status: Optional[str] = None
    # 所有角色列表
    roles: Optional[List[UserRoleInfo]] = None
    # 当前激活的角色信息
    current_role: Optional[UserRoleInfo] = None
    # 组长所属的组信息（仅当用户是组长时才有值）
    leader_groups: Optional[List[dict]] = None  # 格式: [{"id": 1, "name": "组名"}, ...]
    
    class Config:
        from_attributes = True


class Token(BaseModel):
    """令牌模式"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    roles: Optional[List[UserRoleInfo]] = None  # 用户的所有角色列表
    current_role: Optional[UserRoleInfo] = None  # 当前激活的角色


class RefreshTokenRequest(BaseModel):
    """刷新令牌请求模式"""
    refresh_token: str


class TokenData(BaseModel):
    """令牌数据模式"""
    username: Optional[str] = None


class LoginRequest(BaseModel):
    """登录请求模式"""
    username: str
    password: str
    captcha_token: str  # 验证码token
    captcha_answer: int  # 用户输入的验证码答案


class UserApprovalRequest(BaseModel):
    """用户审核请求模式"""
    action: str  # "approve" 或 "reject"
    rejection_reason: Optional[str] = None  # 拒绝原因（拒绝时必填）


class ChangePasswordRequest(BaseModel):
    """修改密码请求模式"""
    old_password: str  # 旧密码
    new_password: str  # 新密码


class SwitchRoleRequest(BaseModel):
    """切换角色请求模式"""
    role_id: int  # 要切换到的角色ID


class AddUserRoleRequest(BaseModel):
    """添加用户角色请求模式"""
    role: UserRole  # 要添加的角色
    sales_unit: Optional[str] = None  # 销售单位（可选，如果不提供则使用用户的默认销售单位）