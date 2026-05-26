"""
安全相关功能：密码加密、JWT令牌生成和验证
"""
from datetime import datetime, timedelta
from typing import Optional, Tuple
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.config import settings
import re

# 密码加密上下文
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码"""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """获取密码哈希"""
    # bcrypt 限制密码长度最多 72 字节
    password_bytes = password.encode('utf-8') if isinstance(password, str) else password
    if len(password_bytes) > 72:
        password_bytes = password_bytes[:72]
        password = password_bytes.decode('utf-8', errors='ignore')
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """创建访问令牌"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> Optional[dict]:
    """解码访问令牌"""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload
    except JWTError as e:
        # 记录详细的错误信息用于调试
        import logging
        logger = logging.getLogger(__name__)
        logger.warning(f"Token解码失败: {str(e)}")
        return None


def create_refresh_token(data: dict) -> str:
    """创建刷新令牌"""
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "type": "refresh"})
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return encoded_jwt


def decode_refresh_token(token: str) -> Optional[dict]:
    """解码刷新令牌"""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        # 验证 token 类型
        if payload.get("type") != "refresh":
            return None
        return payload
    except JWTError:
        return None


def validate_password_strength(password: str) -> Tuple[bool, str]:
    """
    验证密码强度
    返回: (是否有效, 错误消息)
    """
    if len(password) < settings.MIN_PASSWORD_LENGTH:
        return False, f"密码长度至少需要 {settings.MIN_PASSWORD_LENGTH} 个字符"
    
    if settings.REQUIRE_UPPERCASE and not re.search(r'[A-Z]', password):
        return False, "密码必须包含至少一个大写字母"
    
    if settings.REQUIRE_LOWERCASE and not re.search(r'[a-z]', password):
        return False, "密码必须包含至少一个小写字母"
    
    if settings.REQUIRE_DIGIT and not re.search(r'\d', password):
        return False, "密码必须包含至少一个数字"
    
    if settings.REQUIRE_SPECIAL_CHAR and not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
        return False, "密码必须包含至少一个特殊字符 (!@#$%^&*(),.?\":{}|<>)"
    
    return True, ""

