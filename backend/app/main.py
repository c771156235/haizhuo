"""
FastAPI 应用主文件
"""
from fastapi import FastAPI, Request, HTTPException, status
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from app.config import settings
from app.api import auth, tasks, work_orders, opportunities, visit_logs, reviews, users, upload, statistics, export, audit_logs, notifications, groups, todos, option_configs
from app.database import engine, Base, SessionLocal
from app.models.user import User, UserRole, ApprovalStatus, UserRoleAssociation
from app.core.security import get_password_hash
from datetime import datetime
from sqlalchemy.orm import Session

# 根据配置决定是否启用文档
# 默认情况下禁用文档，只有在明确设置 ENABLE_DOCS=true 时才启用
docs_url = "/docs" if settings.ENABLE_DOCS else None
redoc_url = "/redoc" if settings.ENABLE_DOCS else None
openapi_url = "/openapi.json" if settings.ENABLE_DOCS else None

# 创建 FastAPI 应用
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="AI Store FDE支撑系统 - 工单管理和商机跟踪系统",
    docs_url=docs_url,
    redoc_url=redoc_url,
    openapi_url=openapi_url,
)

# 配置 CORS - 必须在所有其他中间件之前添加（最后添加的中间件最先执行）
# 注意：allow_origins=["*"] 和 allow_credentials=True 不能同时使用
# 如果需要 credentials，必须指定具体的 origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=settings.CORS_ALLOW_METHODS,
    allow_headers=settings.CORS_ALLOW_HEADERS,
    expose_headers=settings.CORS_EXPOSE_HEADERS,
    max_age=3600,  # 预检请求缓存时间（秒）
)

# Swagger 文档保护中间件（仅在启用文档时生效）
class DocsProtectionMiddleware(BaseHTTPMiddleware):
    """保护 Swagger 文档的中间件"""
    async def dispatch(self, request: Request, call_next):
        # 检查是否是文档相关路径
        if request.url.path in ["/docs", "/redoc", "/openapi.json"]:
            # 如果文档未启用，直接返回 404
            if not settings.ENABLE_DOCS:
                response = JSONResponse(
                    status_code=status.HTTP_404_NOT_FOUND,
                    content={"detail": "Not found"}
                )
                # 确保CORS头被添加
                origin = request.headers.get("origin")
                if origin and origin in settings.CORS_ORIGINS:
                    response.headers["Access-Control-Allow-Origin"] = origin
                    response.headers["Access-Control-Allow-Credentials"] = "true"
                return response
            
            # 如果需要认证，验证用户 token
            if settings.DOCS_REQUIRE_AUTH:
                from app.core.security import decode_access_token
                authorization = request.headers.get("Authorization")
                
                if not authorization:
                    response = JSONResponse(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        content={
                            "detail": "未授权访问。请在请求头中添加 Authorization: Bearer <token>，或通过登录页面登录后访问。",
                            "login_url": "/api/auth/login"
                        },
                        headers={"WWW-Authenticate": "Bearer"},
                    )
                    # 确保CORS头被添加
                    origin = request.headers.get("origin")
                    if origin and origin in settings.CORS_ORIGINS:
                        response.headers["Access-Control-Allow-Origin"] = origin
                        response.headers["Access-Control-Allow-Credentials"] = "true"
                    return response
                
                # 提取 token
                try:
                    scheme, token = authorization.split()
                    if scheme.lower() != "bearer":
                        raise ValueError("Invalid authorization scheme")
                except ValueError:
                    response = JSONResponse(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        content={"detail": "无效的认证格式，请使用 Bearer <token>"},
                        headers={"WWW-Authenticate": "Bearer"},
                    )
                    # 确保CORS头被添加
                    origin = request.headers.get("origin")
                    if origin and origin in settings.CORS_ORIGINS:
                        response.headers["Access-Control-Allow-Origin"] = origin
                        response.headers["Access-Control-Allow-Credentials"] = "true"
                    return response
                
                # 验证 token
                payload = decode_access_token(token)
                if payload is None:
                    response = JSONResponse(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        content={"detail": "无效或过期的 token"},
                        headers={"WWW-Authenticate": "Bearer"},
                    )
                    # 确保CORS头被添加
                    origin = request.headers.get("origin")
                    if origin and origin in settings.CORS_ORIGINS:
                        response.headers["Access-Control-Allow-Origin"] = origin
                        response.headers["Access-Control-Allow-Credentials"] = "true"
                    return response
                
                # 可选：验证用户是否有权限访问（例如只允许超管）
                # username = payload.get("sub")
                # db = SessionLocal()
                # try:
                #     user = db.query(User).filter(User.username == username).first()
                #     if not user or user.role != UserRole.MANAGER:
                #         return JSONResponse(
                #             status_code=status.HTTP_403_FORBIDDEN,
                #             content={"detail": "只有超管可以访问 API 文档"}
                #         )
                # finally:
                #     db.close()
        
        # 继续处理请求
        response = await call_next(request)
        return response

# 如果启用文档，添加保护中间件（在CORS之后）
if settings.ENABLE_DOCS:
    app.add_middleware(DocsProtectionMiddleware)

# 添加全局异常处理器，确保所有错误响应都包含CORS头
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """HTTP异常处理器，确保错误响应包含CORS头"""
    origin = request.headers.get("origin")
    headers = dict(exc.headers) if exc.headers else {}
    
    # 添加CORS头
    if origin and origin in settings.CORS_ORIGINS:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
        headers["Access-Control-Allow-Methods"] = ", ".join(settings.CORS_ALLOW_METHODS)
        headers["Access-Control-Allow-Headers"] = ", ".join(settings.CORS_ALLOW_HEADERS)
    
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=headers,
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """通用异常处理器，确保所有异常响应都包含CORS头"""
    import logging
    from app.core.logging_config import get_logger
    
    logger = get_logger(__name__)
    
    # 获取用户ID（如果已认证）
    user_id = None
    try:
        from app.api.deps import get_current_user
        # 尝试从请求状态获取用户ID
        if hasattr(request.state, "user_id"):
            user_id = request.state.user_id
    except:
        pass
    
    # 记录详细错误信息（生产环境应记录到文件）
    logger.error(
        f"Unhandled exception: {type(exc).__name__}: {str(exc)}",
        exc_info=True,
        extra={
            "path": request.url.path,
            "method": request.method,
            "user_id": user_id,
            "client_ip": request.client.host if request.client else None
        }
    )
    
    origin = request.headers.get("origin")
    headers = {}
    
    # 添加CORS头
    if origin and origin in settings.CORS_ORIGINS:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
        headers["Access-Control-Allow-Methods"] = ", ".join(settings.CORS_ALLOW_METHODS)
        headers["Access-Control-Allow-Headers"] = ", ".join(settings.CORS_ALLOW_HEADERS)
    
    # 生产环境返回通用错误，开发环境可以返回详细错误
    error_detail = "内部服务器错误"
    if settings.DEBUG:
        error_detail = f"{type(exc).__name__}: {str(exc)}"
    
    return JSONResponse(
        status_code=500,
        content={"detail": error_detail},
        headers=headers,
    )

# 注意：CORS配置信息现在通过日志输出（在startup_event中）

# 注册路由
app.include_router(auth.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(tasks.router, prefix="/api")
app.include_router(work_orders.router, prefix="/api")
app.include_router(opportunities.router, prefix="/api")
app.include_router(visit_logs.router, prefix="/api")
app.include_router(reviews.router, prefix="/api")
app.include_router(upload.router, prefix="/api")
app.include_router(statistics.router, prefix="/api")
app.include_router(export.router, prefix="/api")
app.include_router(audit_logs.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(groups.router, prefix="/api")
app.include_router(todos.router, prefix="/api")
app.include_router(option_configs.router, prefix="/api")


@app.on_event("startup")
async def startup_event():
    """应用启动事件"""
    # 配置日志（必须在其他操作之前）
    from app.core.logging_config import setup_logging
    setup_logging()
    
    # 创建数据库表（生产环境应使用迁移工具）
    # Base.metadata.create_all(bind=engine)
    
    # 自动初始化超管用户（如果不存在已审核的超管）
    await init_admin_user()
    
    # 验证CORS配置
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"✅ CORS中间件已启用，允许的源: {settings.CORS_ORIGINS}")


def ensure_admin_role_association(db: Session, user: User) -> bool:
    """
    确保管理员用户有对应的UserRoleAssociation记录
    返回True表示创建或更新了记录，False表示已存在且正确
    """
    if user.role != UserRole.MANAGER:
        return False
    
    # 检查是否已有UserRoleAssociation记录
    existing_role_assoc = db.query(UserRoleAssociation).filter(
        UserRoleAssociation.user_id == user.id,
        UserRoleAssociation.role == UserRole.MANAGER
    ).first()
    
    if not existing_role_assoc:
        # 创建角色关联记录
        role_assoc = UserRoleAssociation(
            user_id=user.id,
            role=UserRole.MANAGER,
            sales_unit=None,
            is_current=True,
            is_active=True,
            approval_status=ApprovalStatus.APPROVED.value,
            approved_at=datetime.utcnow(),
            approved_by=None
        )
        db.add(role_assoc)
        db.commit()
        db.refresh(role_assoc)
        return True
    elif existing_role_assoc.approval_status != ApprovalStatus.APPROVED.value or not existing_role_assoc.is_active:
        # 如果角色关联记录存在但未审核或未激活，自动审核通过并激活
        existing_role_assoc.approval_status = ApprovalStatus.APPROVED.value
        existing_role_assoc.is_current = True
        existing_role_assoc.is_active = True
        existing_role_assoc.approved_at = datetime.utcnow()
        existing_role_assoc.approved_by = None
        db.commit()
        db.refresh(existing_role_assoc)
        return True
    
    return False


async def init_admin_user():
    """初始化超管用户"""
    import logging
    from app.core.logging_config import get_logger
    logger = get_logger(__name__)
    
    db = SessionLocal()
    try:
        # 检查默认用户名是否已存在
        existing_user = db.query(User).filter(
            User.username == settings.INIT_ADMIN_USERNAME
        ).first()
        
        if existing_user:
            # 用户已存在
            created_or_updated = False
            
            # 如果是超管但未审核，自动审核通过
            if existing_user.role == UserRole.MANAGER and existing_user.approval_status != ApprovalStatus.APPROVED.value:
                existing_user.approval_status = ApprovalStatus.APPROVED.value
                existing_user.approved_at = datetime.utcnow()
                existing_user.approved_by = None
                db.commit()
                logger.info(f"✅ 已自动审核通过超管用户: {settings.INIT_ADMIN_USERNAME}")
                created_or_updated = True
            
            # 确保有UserRoleAssociation记录
            if ensure_admin_role_association(db, existing_user):
                logger.info(f"✅ 已为超管用户创建/更新角色关联记录")
                created_or_updated = True
            
            if not created_or_updated:
                logger.info(f"✅ 超管用户已存在且状态正常: {settings.INIT_ADMIN_USERNAME}")
            else:
                logger.info("=" * 60)
                logger.info("✅ 系统初始化完成！已修复超管用户配置")
                logger.info(f"   用户名: {settings.INIT_ADMIN_USERNAME}")
                logger.info("=" * 60)
            
            return
        
        # 检查是否已存在其他已审核的超管（但不一定是默认用户名）
        existing_manager = db.query(User).filter(
            User.role == UserRole.MANAGER,
            User.approval_status == ApprovalStatus.APPROVED.value
        ).first()
        
        if existing_manager:
            # 已有已审核的超管，确保其有UserRoleAssociation记录
            if ensure_admin_role_association(db, existing_manager):
                logger.info(f"✅ 已为现有超管用户创建/更新角色关联记录: {existing_manager.username}")
            logger.info("✅ 系统中已存在超管用户，跳过创建新用户")
            return
        
        # 创建默认超管用户
        admin = User(
            username=settings.INIT_ADMIN_USERNAME,
            password_hash=get_password_hash(settings.INIT_ADMIN_PASSWORD),
            real_name=settings.INIT_ADMIN_NAME,
            role=UserRole.MANAGER,
            is_active=True,
            approval_status=ApprovalStatus.APPROVED.value,
            approved_at=datetime.utcnow(),
            approved_by=None  # 系统自动创建，无审核人
        )
        db.add(admin)
        db.flush()  # 获取admin.id，但不提交事务
        
        # 创建对应的角色关联记录
        role_assoc = UserRoleAssociation(
            user_id=admin.id,
            role=UserRole.MANAGER,
            sales_unit=None,
            is_current=True,
            is_active=True,
            approval_status=ApprovalStatus.APPROVED.value,
            approved_at=datetime.utcnow(),
            approved_by=None  # 系统自动创建，无审核人
        )
        db.add(role_assoc)
        db.commit()
        logger.info("=" * 60)
        logger.info("✅ 系统初始化完成！已自动创建超管用户")
        logger.info(f"   用户名: {settings.INIT_ADMIN_USERNAME}")
        logger.info(f"   密码: {settings.INIT_ADMIN_PASSWORD}")
        logger.info(f"   角色: 超管 (MANAGER)")
        logger.warning("   ⚠️  请首次登录后立即修改默认密码！")
        logger.info("=" * 60)
    except Exception as e:
        db.rollback()
        logger.error(f"⚠️  初始化超管用户失败: {e}")
        logger.error("   请检查数据库连接或手动创建超管用户")
    finally:
        db.close()

@app.get("/")
def root():
    """根路径"""
    response_data = {
        "message": "AI Store FDE支撑系统 API",
        "version": settings.APP_VERSION,
    }
    # 只在启用文档时显示文档链接
    if settings.ENABLE_DOCS:
        response_data["docs"] = "/docs"
    return response_data


@app.get("/health")
def health_check():
    """健康检查"""
    return {"status": "healthy"}


@app.get("/api/cors-test")
def cors_test():
    """CORS测试端点"""
    return {
        "message": "CORS配置正常",
        "cors_enabled": True,
        "allowed_origins": settings.CORS_ORIGINS,
        "config_loaded": True
    }

