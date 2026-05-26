"""
认证相关 API
"""
from datetime import datetime, timedelta
from typing import Dict, Tuple
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError, OperationalError
from app.database import get_db
from app.models.user import User, UserRole, ApprovalStatus, UserRoleAssociation
from app.schemas.user import LoginRequest, Token, UserResponse, RefreshTokenRequest, UserRegister, ChangePasswordRequest, SwitchRoleRequest, UserRoleInfo
from app.core.security import (
    verify_password, 
    get_password_hash,
    create_access_token, 
    create_refresh_token,
    decode_refresh_token,
    validate_password_strength
)
from app.api.deps import get_current_user
from app.config import settings
import time
import jwt
import uuid
from app.utils.captcha_utils import generate_math_captcha

router = APIRouter(prefix="/auth", tags=["认证"])

# 简单的内存限流缓存（生产环境建议使用 Redis）
_rate_limit_cache: Dict[str, Tuple[int, float]] = {}
RATE_LIMIT_WINDOW = 60  # 时间窗口（秒）
RATE_LIMIT_MAX_ATTEMPTS = 10  # 时间窗口内最大尝试次数

# 验证码 JWT 的 jti 一次性核销（防同一验证码多次猜解；多实例部署请改用 Redis）
_captcha_consumed_jti: Dict[str, float] = {}
# 略长于验证码 JWT 有效期（get_captcha 中为 5 分钟），用于清理内存
CAPTCHA_JTI_RETENTION_SEC = 360


def _cleanup_expired_captcha_jti() -> None:
    now = time.time()
    expired = [
        jti
        for jti, ts in _captcha_consumed_jti.items()
        if now - ts > CAPTCHA_JTI_RETENTION_SEC
    ]
    for jti in expired:
        _captcha_consumed_jti.pop(jti, None)


def _is_captcha_jti_consumed(jti: str) -> bool:
    _cleanup_expired_captcha_jti()
    return jti in _captcha_consumed_jti


def _consume_captcha_jti(jti: str) -> None:
    _cleanup_expired_captcha_jti()
    _captcha_consumed_jti[jti] = time.time()


def get_client_ip(request: Request) -> str:
    """获取客户端 IP 地址"""
    if request.client:
        return request.client.host
    return "unknown"


def check_rate_limit(ip: str) -> bool:
    """
    检查是否超过限流
    返回: True 表示允许，False 表示超过限流
    """
    current_time = time.time()
    
    # 清理过期记录
    expired_keys = [
        key for key, (_, timestamp) in _rate_limit_cache.items()
        if current_time - timestamp > RATE_LIMIT_WINDOW
    ]
    for key in expired_keys:
        _rate_limit_cache.pop(key, None)
    
    # 检查当前 IP
    if ip in _rate_limit_cache:
        attempts, timestamp = _rate_limit_cache[ip]
        if current_time - timestamp < RATE_LIMIT_WINDOW:
            if attempts >= RATE_LIMIT_MAX_ATTEMPTS:
                return False
            _rate_limit_cache[ip] = (attempts + 1, timestamp)
        else:
            # 时间窗口已过，重置
            _rate_limit_cache[ip] = (1, current_time)
    else:
        _rate_limit_cache[ip] = (1, current_time)
    
    return True


@router.get("/captcha")
def get_captcha():
    """
    生成验证码
    返回: 图片base64 + JWT token
    """
    # 1. 生成算术验证码
    captcha_data = generate_math_captcha()
    
    # 2. 创建 JWT payload (答案加密存储在token中)
    payload = {
        'answer': captcha_data['answer'],  # 正确答案
        'exp': datetime.utcnow() + timedelta(minutes=5),  # 5分钟后过期
        'iat': datetime.utcnow(),  # 签发时间
        'jti': str(uuid.uuid4())  # 唯一ID (防止重放攻击)
    }
    
    # 3. 使用 JWT 加密答案
    captcha_token = jwt.encode(
        payload,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM
    )
    
    # 4. 返回图片和token
    return {
        'image': captcha_data['image'],
        'captcha_token': captcha_token,
        'question': captcha_data['question']  # 仅供调试，生产环境可删除
    }


@router.post("/login", response_model=Token)
def login(login_data: LoginRequest, request: Request, db: Session = Depends(get_db)):
    """用户登录"""
    # ========== 第一步: 验证验证码（jti 一次性核销：答错或答对均作废） ==========
    try:
        # 1. 解密 JWT token
        decoded = jwt.decode(
            login_data.captcha_token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM]
        )

        jti = decoded.get('jti')
        if not jti:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="验证码无效"
            )
        if _is_captcha_jti_consumed(jti):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="验证码已失效，请刷新后重试"
            )

        # 2. JWT 会自动验证 exp、签名

        # 3. 校验答案：错误则核销 jti 后拒绝，防止对同一 token 穷举
        stored_answer = decoded['answer']
        if int(login_data.captcha_answer) != stored_answer:
            _consume_captcha_jti(jti)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="验证码错误"
            )

        # 4. 校验通过：核销 jti，后续账号密码失败也需重新拉验证码
        _consume_captcha_jti(jti)

    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="验证码已过期,请刷新后重试"
        )
    except jwt.InvalidSignatureError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="验证码无效"
        )
    except jwt.DecodeError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="验证码格式错误"
        )
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="验证码答案格式错误"
        )
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="验证码验证失败"
        )
    
    # ========== 第二步: 限流检查 ==========
    # 限流检查
    client_ip = get_client_ip(request)
    if not check_rate_limit(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"请求过于频繁，请在 {RATE_LIMIT_WINDOW} 秒后再试"
        )
    
    user = db.query(User).filter(User.username == login_data.username).first()
    
    # 检查账户是否被锁定
    if user and user.locked_until:
        if datetime.utcnow() < user.locked_until:
            remaining_minutes = int((user.locked_until - datetime.utcnow()).total_seconds() / 60)
            raise HTTPException(
                status_code=status.HTTP_423_LOCKED,
                detail=f"账户已被锁定，请在 {remaining_minutes} 分钟后重试"
            )
        else:
            # 锁定时间已过，解除锁定
            user.locked_until = None
            user.failed_login_attempts = 0
            db.commit()
    
    # 验证用户名和密码
    if not user or not verify_password(login_data.password, user.password_hash):
        # 如果用户存在，增加失败次数
        if user:
            user.failed_login_attempts += 1
            
            # 如果达到最大尝试次数，锁定账户
            if user.failed_login_attempts >= settings.MAX_LOGIN_ATTEMPTS:
                user.locked_until = datetime.utcnow() + timedelta(minutes=settings.LOCKOUT_DURATION_MINUTES)
                db.commit()
                raise HTTPException(
                    status_code=status.HTTP_423_LOCKED,
                    detail=f"登录失败次数过多，账户已被锁定 {settings.LOCKOUT_DURATION_MINUTES} 分钟"
                )
            else:
                remaining_attempts = settings.MAX_LOGIN_ATTEMPTS - user.failed_login_attempts
                db.commit()
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"用户名或密码错误，剩余尝试次数：{remaining_attempts}",
                    headers={"WWW-Authenticate": "Bearer"},
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="用户名或密码错误",
                headers={"WWW-Authenticate": "Bearer"},
            )
    
    # 检查用户审核状态
    # 特殊情况：如果是超管（MANAGER）且系统中没有其他已审核的超管，允许其登录（用于系统初始化）
    if user.approval_status == ApprovalStatus.PENDING.value:
        # 检查是否是超管且是系统中唯一的超管（用于首次初始化）
        if user.role == UserRole.MANAGER:
            approved_managers_count = db.query(User).filter(
                User.role == UserRole.MANAGER,
                User.approval_status == ApprovalStatus.APPROVED.value,
                User.id != user.id  # 排除当前用户
            ).count()
            
            # 如果系统中没有其他已审核的超管，允许当前超管登录（初始化场景）
            if approved_managers_count == 0:
                # 自动审核通过该超管（系统初始化）
                user.approval_status = ApprovalStatus.APPROVED.value
                user.approved_at = datetime.utcnow()
                user.approved_by = None  # 系统自动审核
                db.commit()
            else:
                # 有其他已审核的超管，需要等待审核
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="您的账号正在审核中，请等待管理员审核通过后再登录"
                )
        else:
            # 非超管用户必须等待审核
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="您的账号正在审核中，请等待管理员审核通过后再登录"
            )
    
    # 检查审核拒绝状态
    if user.approval_status == ApprovalStatus.REJECTED.value:
        reason = f"，拒绝原因：{user.rejection_reason}" if user.rejection_reason else ""
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"您的账号审核未通过{reason}，如有疑问请联系管理员"
        )
    
    # 检查用户是否激活
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="用户已被禁用"
        )
    
    # 最终确认：只有审核通过的用户才能登录（超管初始化后状态已更新为 APPROVED，可以通过此检查）
    if user.approval_status != ApprovalStatus.APPROVED.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="账号审核未通过，无法登录"
        )
    
    # 登录成功，重置失败次数和锁定状态
    user.failed_login_attempts = 0
    user.locked_until = None
    db.commit()
    
    # 获取用户的所有已审核通过的角色
    approved_roles = db.query(UserRoleAssociation).filter(
        UserRoleAssociation.user_id == user.id,
        UserRoleAssociation.approval_status == ApprovalStatus.APPROVED.value,
        UserRoleAssociation.is_active == True
    ).all()
    
    # 获取当前激活的角色
    current_role = db.query(UserRoleAssociation).filter(
        UserRoleAssociation.user_id == user.id,
        UserRoleAssociation.is_current == True,
        UserRoleAssociation.approval_status == ApprovalStatus.APPROVED.value,
        UserRoleAssociation.is_active == True
    ).first()
    
    # 如果没有当前激活的角色，使用第一个已审核通过的角色
    if not current_role and approved_roles:
        current_role = approved_roles[0]
        # 设置为当前角色
        db.query(UserRoleAssociation).filter(
            UserRoleAssociation.user_id == user.id,
            UserRoleAssociation.is_current == True
        ).update({"is_current": False})
        current_role.is_current = True
        db.commit()
        db.refresh(current_role)
    
    # 向后兼容：如果用户表中还有role字段（迁移期间）
    if not current_role and user.role:
        # 尝试查找对应的角色关联
        role_assoc = db.query(UserRoleAssociation).filter(
            UserRoleAssociation.user_id == user.id,
            UserRoleAssociation.role == user.role
        ).first()
        
        if role_assoc:
            current_role = role_assoc
            # 设置为当前角色
            db.query(UserRoleAssociation).filter(
                UserRoleAssociation.user_id == user.id,
                UserRoleAssociation.is_current == True
            ).update({"is_current": False})
            current_role.is_current = True
            db.commit()
            db.refresh(current_role)
        else:
            # 如果没有找到角色关联记录，但用户有role字段，自动创建（向后兼容）
            # 这种情况通常发生在系统初始化时创建的用户
            if user.approval_status == ApprovalStatus.APPROVED.value:
                role_assoc = UserRoleAssociation(
                    user_id=user.id,
                    role=user.role,
                    sales_unit=user.sales_unit,
                    is_current=True,
                    is_active=True,
                    approval_status=ApprovalStatus.APPROVED.value,
                    approved_at=user.approved_at or datetime.utcnow(),
                    approved_by=user.approved_by
                )
                db.add(role_assoc)
                db.commit()
                db.refresh(role_assoc)
                current_role = role_assoc
                approved_roles = [role_assoc]
                # 刷新查询
                approved_roles = db.query(UserRoleAssociation).filter(
                    UserRoleAssociation.user_id == user.id,
                    UserRoleAssociation.approval_status == ApprovalStatus.APPROVED.value,
                    UserRoleAssociation.is_active == True
                ).all()
    
    # 检查是否有已审核通过的角色
    if not approved_roles and not current_role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="您没有已审核通过的角色，请联系管理员"
        )
    
    # 生成 token（包含当前角色ID）
    token_data = {"sub": user.username}
    if current_role:
        token_data["role_id"] = current_role.id
    
    access_token = create_access_token(data=token_data)
    refresh_token = create_refresh_token(data={"sub": user.username})
    
    # 构建角色信息列表
    roles_info = [UserRoleInfo(
        id=role.id,
        role=role.role,
        sales_unit=role.sales_unit,
        is_current=role.is_current,
        is_active=role.is_active,
        approval_status=role.approval_status,
        rejection_reason=role.rejection_reason,
        approved_at=role.approved_at,
        created_at=role.created_at
    ) for role in approved_roles]
    
    current_role_info = None
    if current_role:
        current_role_info = UserRoleInfo(
            id=current_role.id,
            role=current_role.role,
            sales_unit=current_role.sales_unit,
            is_current=current_role.is_current,
            is_active=current_role.is_active,
            approval_status=current_role.approval_status,
            rejection_reason=current_role.rejection_reason,
            approved_at=current_role.approved_at,
            created_at=current_role.created_at
        )
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "roles": roles_info,
        "current_role": current_role_info
    }


@router.post("/refresh", response_model=Token)
def refresh_token(refresh_data: RefreshTokenRequest, db: Session = Depends(get_db)):
    """刷新访问令牌"""
    payload = decode_refresh_token(refresh_data.refresh_token)
    
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的刷新令牌",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    username: str = payload.get("sub")
    if username is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的刷新令牌",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 验证用户是否存在且激活
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 检查用户是否有已审核通过的角色
    approved_roles = db.query(UserRoleAssociation).filter(
        UserRoleAssociation.user_id == user.id,
        UserRoleAssociation.approval_status == ApprovalStatus.APPROVED.value,
        UserRoleAssociation.is_active == True
    ).count()
    
    # 向后兼容：如果用户表中还有approval_status字段
    if approved_roles == 0:
        if hasattr(user, 'approval_status') and user.approval_status:
            if user.approval_status != ApprovalStatus.APPROVED.value:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="账号审核未通过，无法刷新令牌"
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="您没有已审核通过的角色，无法刷新令牌"
            )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="用户已被禁用"
        )
    
    # 生成新的 token
    access_token = create_access_token(data={"sub": user.username})
    refresh_token = create_refresh_token(data={"sub": user.username})
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }


@router.get("/me", response_model=UserResponse)
def get_current_user_info(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """获取当前用户信息（包含角色信息）"""
    # 获取用户的所有角色
    roles = db.query(UserRoleAssociation).filter(
        UserRoleAssociation.user_id == current_user.id
    ).all()
    
    # 获取当前激活的角色
    current_role = db.query(UserRoleAssociation).filter(
        UserRoleAssociation.user_id == current_user.id,
        UserRoleAssociation.is_current == True
    ).first()
    
    # 向后兼容：如果用户表中还有role字段
    role = current_user.role if current_user.role else (current_role.role if current_role else None)
    sales_unit = current_user.sales_unit if current_user.sales_unit else (current_role.sales_unit if current_role else None)
    approval_status = current_user.approval_status if current_user.approval_status else (current_role.approval_status if current_role else None)
    
    # 构建响应
    user_dict = {
        "id": current_user.id,
        "username": current_user.username,
        "real_name": current_user.real_name,
        "email": current_user.email,
        "phone": current_user.phone,
        "avatar": current_user.avatar,
        "is_active": current_user.is_active,
        "created_at": current_user.created_at,
        "updated_at": current_user.updated_at,
        "role": role,
        "sales_unit": sales_unit,
        "approval_status": approval_status,
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
        ) for r in roles],
        "current_role": UserRoleInfo(
            id=current_role.id,
            role=current_role.role,
            sales_unit=current_role.sales_unit,
            is_current=current_role.is_current,
            is_active=current_role.is_active,
            approval_status=current_role.approval_status,
            rejection_reason=current_role.rejection_reason,
            approved_at=current_role.approved_at,
            created_at=current_role.created_at
        ) if current_role else None
    }
    
    return user_dict


@router.post("/switch-role", response_model=Token)
def switch_role(
    role_data: SwitchRoleRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """切换当前激活的角色（需要权限验证和审计日志）"""
    from app.core.audit import log_user_action
    from app.models.audit_log import AuditAction
    
    # 获取当前激活的角色
    current_role_assoc = db.query(UserRoleAssociation).filter(
        UserRoleAssociation.user_id == current_user.id,
        UserRoleAssociation.is_current == True
    ).first()
    
    # 验证目标角色是否属于当前用户
    target_role = db.query(UserRoleAssociation).filter(
        UserRoleAssociation.id == role_data.role_id,
        UserRoleAssociation.user_id == current_user.id
    ).first()
    
    if not target_role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="角色不存在或不属于当前用户"
        )
    
    # 检查是否尝试切换到当前已激活的角色
    if current_role_assoc and target_role.id == current_role_assoc.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该角色已经是当前激活的角色"
        )
    
    # 检查角色是否已审核通过
    if target_role.approval_status != ApprovalStatus.APPROVED.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="该角色尚未审核通过，无法切换"
        )
    
    # 检查角色是否激活
    if not target_role.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="该角色已被禁用，无法切换"
        )
    
    # 记录切换前的角色信息（用于审计日志，使用中文标签与前端一致）
    from app.models.user import USER_ROLE_LABELS
    old_role_name = USER_ROLE_LABELS.get(current_role_assoc.role, current_role_assoc.role.value) if current_role_assoc else "无"
    new_role_name = USER_ROLE_LABELS.get(target_role.role, target_role.role.value)
    
    # 更新当前角色状态
    # 先取消所有角色的当前状态
    db.query(UserRoleAssociation).filter(
        UserRoleAssociation.user_id == current_user.id,
        UserRoleAssociation.is_current == True
    ).update({"is_current": False})
    
    # 设置新角色为当前角色
    target_role.is_current = True
    db.commit()
    db.refresh(target_role)
    
    # 记录角色切换的审计日志
    log_user_action(
        db=db,
        user_id=current_user.id,
        action=AuditAction.UPDATE,
        target_user_id=current_user.id,
        description=f"切换角色：从 {old_role_name} 切换到 {new_role_name}",
        request=request
    )
    db.commit()
    
    # 获取用户的所有已审核通过的角色
    approved_roles = db.query(UserRoleAssociation).filter(
        UserRoleAssociation.user_id == current_user.id,
        UserRoleAssociation.approval_status == ApprovalStatus.APPROVED.value,
        UserRoleAssociation.is_active == True
    ).all()
    
    # 生成新的 token（包含新的角色ID）
    token_data = {"sub": current_user.username, "role_id": target_role.id}
    access_token = create_access_token(data=token_data)
    refresh_token = create_refresh_token(data={"sub": current_user.username})
    
    # 构建角色信息列表
    roles_info = [UserRoleInfo(
        id=role.id,
        role=role.role,
        sales_unit=role.sales_unit,
        is_current=role.is_current,
        is_active=role.is_active,
        approval_status=role.approval_status,
        rejection_reason=role.rejection_reason,
        approved_at=role.approved_at,
        created_at=role.created_at
    ) for role in approved_roles]
    
    current_role_info = UserRoleInfo(
        id=target_role.id,
        role=target_role.role,
        sales_unit=target_role.sales_unit,
        is_current=target_role.is_current,
        is_active=target_role.is_active,
        approval_status=target_role.approval_status,
        rejection_reason=target_role.rejection_reason,
        approved_at=target_role.approved_at,
        created_at=target_role.created_at
    )
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "roles": roles_info,
        "current_role": current_role_info
    }


@router.post("/change-password")
def change_password(
    password_data: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """修改密码"""
    # 验证旧密码
    if not verify_password(password_data.old_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="旧密码错误"
        )
    
    # 验证新密码不能与旧密码相同
    if verify_password(password_data.new_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="新密码不能与旧密码相同"
        )
    
    # 验证新密码强度
    is_valid, error_msg = validate_password_strength(password_data.new_password)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_msg
        )
    
    # 更新密码
    current_user.password_hash = get_password_hash(password_data.new_password)
    db.commit()
    
    return {"message": "密码修改成功"}


@router.get("/check-username")
def check_username(
    username: str = Query(..., min_length=3, max_length=50, description="要检查的用户名"),
    request: Request = None,
    db: Session = Depends(get_db)
):
    """
    检查用户名格式是否有效（公开访问）
    
    安全措施：
    1. 速率限制防止暴力枚举（每分钟最多5次）
    2. 只验证格式，不暴露用户名是否存在
    3. 实际的用户名冲突检查在注册时进行
    
    注意：为了防止用户名枚举攻击，此接口只验证格式，不检查是否存在
    """
    # 速率限制：防止暴力枚举（使用更严格的限制）
    if request:
        client_ip = get_client_ip(request)
        # 为用户名检查使用更严格的限流：每分钟最多5次
        rate_limit_key = f"check_username_{client_ip}"
        current_time = time.time()
        
        # 清理过期记录
        expired_keys = [
            key for key, (_, timestamp) in _rate_limit_cache.items()
            if current_time - timestamp > RATE_LIMIT_WINDOW
        ]
        for key in expired_keys:
            _rate_limit_cache.pop(key, None)
        
        # 检查当前 IP 的请求频率（限制为每分钟5次）
        if rate_limit_key in _rate_limit_cache:
            attempts, timestamp = _rate_limit_cache[rate_limit_key]
            if current_time - timestamp < RATE_LIMIT_WINDOW:
                if attempts >= 5:  # 更严格的限制
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail="请求过于频繁，请稍后再试"
                    )
                _rate_limit_cache[rate_limit_key] = (attempts + 1, timestamp)
            else:
                _rate_limit_cache[rate_limit_key] = (1, current_time)
        else:
            _rate_limit_cache[rate_limit_key] = (1, current_time)
    
    # 只验证格式，不检查是否存在（防止用户名枚举攻击）
    # 实际的用户名冲突检查会在注册时进行
    # 验证用户名格式：只允许字母、数字、下划线
    import re
    if not re.match(r'^[a-zA-Z0-9_]+$', username):
        return {
            "available": False,
            "message": "用户名只能包含字母、数字和下划线"
        }
    
    # 格式验证通过，返回可用（但不检查是否已存在）
    return {
        "available": True,
        "message": "用户名格式正确"
    }


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user_data: UserRegister, db: Session = Depends(get_db)):
    """用户注册（公开访问，注册后状态为待审核）"""
    from app.core.security import get_password_hash, validate_password_strength
    
    # 清理和验证必填字段
    username = user_data.username.strip() if user_data.username else ''
    real_name = user_data.real_name.strip() if user_data.real_name else ''
    password = user_data.password if user_data.password else ''
    
    if not username:
        raise HTTPException(status_code=422, detail="用户名不能为空")
    if not real_name:
        raise HTTPException(status_code=422, detail="真实姓名不能为空")
    if not password:
        raise HTTPException(status_code=422, detail="密码不能为空")
    
    # 处理必填字段：清理并验证
    email = user_data.email.strip() if user_data.email else ''
    phone = user_data.phone.strip() if user_data.phone else ''
    sales_unit = user_data.sales_unit.strip() if user_data.sales_unit else ''
    
    # 验证必填字段
    if not email:
        raise HTTPException(status_code=422, detail="邮箱不能为空")
    if not phone:
        raise HTTPException(status_code=422, detail="手机号不能为空")
    if not sales_unit:
        raise HTTPException(status_code=422, detail="销售单位不能为空")
    
    # 调试日志
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"Register data received: username={username}, email={email}, phone={phone}, sales_unit={sales_unit}")
    
    # 处理角色：如果用户选择了角色，使用用户选择的角色；否则默认为成员
    # 但禁止注册时选择总管角色
    user_role = user_data.role if user_data.role else UserRole.MEMBER
    if user_role == UserRole.MANAGER:
        raise HTTPException(status_code=400, detail="不允许注册总管角色")
    
    # 检查用户名是否已存在
    # 注意：不使用 with_for_update 避免死锁，依赖数据库唯一约束作为最后防线
    existing_user = db.query(User).filter(User.username == username).first()
    
    # 检查邮箱是否已存在
    existing_email = None
    if email:
        existing_email = db.query(User).filter(User.email == email).first()
    
    # 如果用户已存在，检查是否要添加新角色
    if existing_user:
        # 验证邮箱是否匹配
        if existing_email and existing_email.id != existing_user.id:
            raise HTTPException(status_code=400, detail="邮箱已被其他用户使用")
        
        if existing_user.email != email:
            raise HTTPException(status_code=400, detail="用户名已存在，请选择其他用户名")
        
        # 用户已存在，检查该角色是否已注册
        existing_role = db.query(UserRoleAssociation).filter(
            UserRoleAssociation.user_id == existing_user.id,
            UserRoleAssociation.role == user_role
        ).first()
        
        if existing_role:
            raise HTTPException(status_code=400, detail=f"您已经注册过{user_role.value}角色")
        
        # 创建新的角色关联
        new_role = UserRoleAssociation(
            user_id=existing_user.id,
            role=user_role,
            sales_unit=sales_unit,
            is_current=False,  # 新角色默认不是当前角色
            is_active=True,
            approval_status=ApprovalStatus.PENDING.value
        )
        
        try:
            db.add(new_role)
            db.commit()
            db.refresh(new_role)
            db.refresh(existing_user)
            
            # 发送通知
            try:
                from app.services.notification_service import notify_user_registration_pending
                notify_user_registration_pending(db, existing_user)
            except Exception as e:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Failed to send registration notification: {str(e)}")
            
            # 返回用户信息（包含新角色）
            return existing_user
        except IntegrityError as e:
            db.rollback()
            error_msg = str(e.orig) if hasattr(e, 'orig') else str(e)
            logger.error(f"IntegrityError when adding role: {error_msg}")
            # 检查是否是角色重复错误（user_roles表的唯一约束）
            if 'user_id' in error_msg.lower() and 'role' in error_msg.lower() or 'idx_user_role' in error_msg.lower():
                raise HTTPException(
                    status_code=400,
                    detail=f"您已经注册过{user_role.value}角色，请勿重复注册"
                )
            # 检查是否是用户名重复（虽然已经检查过，但可能是并发情况）
            elif 'username' in error_msg.lower() or '1062' in error_msg or 'Duplicate entry' in error_msg:
                raise HTTPException(
                    status_code=400,
                    detail="用户名已存在，请选择其他用户名"
                )
            # 检查是否是邮箱重复
            elif 'email' in error_msg.lower():
                raise HTTPException(
                    status_code=400,
                    detail="邮箱已被使用"
                )
            else:
                # 其他完整性错误，记录详细日志
                logger.error(f"Unknown IntegrityError: {error_msg}")
                raise HTTPException(
                    status_code=400,
                    detail=f"注册失败，数据冲突：{error_msg[:100]}"
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
        email=email,
        phone=phone,
        password_hash=get_password_hash(password),
        role=user_role,  # 向后兼容：设置role字段（数据库可能还是NOT NULL）
        sales_unit=sales_unit,  # 向后兼容：设置sales_unit字段
        approval_status=ApprovalStatus.PENDING.value,  # 向后兼容：设置approval_status字段
        is_active=True  # 激活状态，但需要审核通过才能登录
    )
    
    try:
        db.add(new_user)
        db.flush()  # 获取用户ID
        
        # 创建角色关联
        new_role = UserRoleAssociation(
            user_id=new_user.id,
            role=user_role,
            sales_unit=sales_unit,
            is_current=True,  # 第一个角色设为当前角色
            is_active=True,
            approval_status=ApprovalStatus.PENDING.value
        )
        db.add(new_role)
        db.commit()
        db.refresh(new_user)
        db.refresh(new_role)
    except IntegrityError as e:
        db.rollback()
        # 检查是否是用户名重复错误
        error_msg = str(e.orig) if hasattr(e, 'orig') else str(e)
        logger.error(f"IntegrityError when creating user: {error_msg}")
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
                detail=f"您已经注册过{user_role.value}角色"
            )
        else:
            # 其他完整性错误，记录详细日志
            logger.error(f"Unknown IntegrityError: {error_msg}")
            raise HTTPException(
                status_code=400,
                detail=f"注册失败，数据冲突：{error_msg[:100]}"
            )
    except OperationalError as e:
        db.rollback()
        # 处理死锁错误
        error_msg = str(e.orig) if hasattr(e, 'orig') else str(e)
        if '1213' in error_msg or 'Deadlock' in error_msg or 'deadlock' in error_msg.lower():
            # 死锁错误，提示用户重试
            raise HTTPException(
                status_code=503,
                detail="系统繁忙，请稍后重试"
            )
        else:
            # 其他数据库操作错误
            raise HTTPException(
                status_code=500,
                detail="数据库操作失败，请稍后重试"
            )
    
    # 发送通知给所有总管：有新用户注册待审核（在用户创建成功后，异步发送）
    # 注意：通知发送失败不影响注册流程
    try:
        from app.services.notification_service import notify_user_registration_pending
        notify_user_registration_pending(db, new_user)
    except Exception as e:
        # 通知发送失败不影响注册流程，只记录日志
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to send registration notification: {str(e)}")
    
    return new_user

