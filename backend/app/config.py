"""
应用配置
"""
from pydantic_settings import BaseSettings
from typing import Optional
import os
import secrets
import warnings


class Settings(BaseSettings):
    """应用配置类"""
    
    # 应用配置
    APP_NAME: str = "AI Store FDE支撑系统"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    
    # 数据库配置
    DB_HOST: str = "localhost"
    DB_PORT: int = 3306
    DB_USER: str = "root"
    DB_PASSWORD: str = "root"
    DB_NAME: str = "fde_system"
    
    # 安全配置
    SECRET_KEY: str = ""  # 必须从环境变量读取
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 180  # 3小时
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7  # 7天
    
    # 登录安全配置
    MAX_LOGIN_ATTEMPTS: int = 5  # 最大登录尝试次数
    LOCKOUT_DURATION_MINUTES: int = 5  # 账户锁定时长（分钟）
    
    # 密码策略配置
    MIN_PASSWORD_LENGTH: int = 8  # 最小密码长度
    REQUIRE_UPPERCASE: bool = True  # 要求大写字母
    REQUIRE_LOWERCASE: bool = True  # 要求小写字母
    REQUIRE_DIGIT: bool = True  # 要求数字
    REQUIRE_SPECIAL_CHAR: bool = True  # 要求特殊字符
    
    # 服务器配置
    HOST: str = "0.0.0.0"
    PORT: int = 8000
    
    # CORS 配置
    CORS_ORIGINS: list = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",  # Vite 默认端口
        "http://127.0.0.1:5173",
    ]
    CORS_ALLOW_CREDENTIALS: bool = True
    CORS_ALLOW_METHODS: list = ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"]
    # 允许的请求头（使用具体列表，而不是 "*"）
    CORS_ALLOW_HEADERS: list = [
        "Accept",
        "Accept-Language",
        "Content-Language",
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "Origin",
        "Access-Control-Request-Method",
        "Access-Control-Request-Headers",
    ]
    CORS_EXPOSE_HEADERS: list = [
        "Content-Length",
        "Content-Type",
        "Authorization",
    ]
    
    # 文件上传配置
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_SIZE: int = 5 * 1024 * 1024  # 5MB
    ALLOWED_IMAGE_TYPES: list = ["image/jpeg", "image/png", "image/gif", "image/webp"]
    
    # 初始化配置（可通过环境变量覆盖）
    INIT_ADMIN_USERNAME: str = os.getenv("INIT_ADMIN_USERNAME", "admin")  # 默认超管用户名
    INIT_ADMIN_PASSWORD: str = os.getenv("INIT_ADMIN_PASSWORD", "admin123")  # 默认超管密码（建议首次登录后修改）
    INIT_ADMIN_NAME: str = os.getenv("INIT_ADMIN_NAME", "系统管理员")  # 默认超管真实姓名
    
    # Swagger 文档配置
    ENABLE_DOCS: bool = os.getenv("ENABLE_DOCS", "false").lower() == "true"  # 是否启用文档（默认关闭）
    DOCS_REQUIRE_AUTH: bool = os.getenv("DOCS_REQUIRE_AUTH", "true").lower() == "true"  # 文档是否需要认证（默认需要）
    
    @property
    def database_url(self) -> str:
        """构建数据库连接URL"""
        return f"mysql+pymysql://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}?charset=utf8mb4"
    
    class Config:
        env_file = ".env"
        case_sensitive = True
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        # 如果 SECRET_KEY 未设置或使用默认值，从环境变量读取或生成警告
        if not self.SECRET_KEY or self.SECRET_KEY == "your-secret-key-change-in-production":
            env_secret = os.getenv("SECRET_KEY")
            if env_secret:
                self.SECRET_KEY = env_secret
            else:
                if not self.DEBUG:
                    raise ValueError(
                        "SECRET_KEY 必须在生产环境中设置！请通过环境变量 SECRET_KEY 设置，"
                        "或在 .env 文件中配置。"
                    )
                else:
                    # 开发环境生成临时密钥（每次启动都会变化，仅用于开发）
                    self.SECRET_KEY = secrets.token_urlsafe(32)
                    warnings.warn(
                        f"⚠️  警告：SECRET_KEY 未设置，已生成临时密钥（仅用于开发环境）。"
                        f"生产环境必须通过环境变量 SECRET_KEY 设置固定密钥！",
                        UserWarning
                    )


settings = Settings()

