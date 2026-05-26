"""
操作日志记录工具
"""
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from fastapi import Request
from app.models.audit_log import AuditLog, AuditAction, AuditResource
from app.core.logging_config import get_logger

logger = get_logger(__name__)


def get_client_ip(request: Request) -> Optional[str]:
    """获取客户端IP地址"""
    # 优先检查代理头（如果应用部署在反向代理后面）
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        # X-Forwarded-For 可能包含多个IP，取第一个（原始客户端IP）
        return forwarded_for.split(",")[0].strip()
    
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()
    
    # 如果没有代理头，使用 request.client.host
    if request.client:
        return request.client.host
    
    return None


def get_user_agent(request: Request) -> Optional[str]:
    """获取用户代理"""
    return request.headers.get("user-agent")


def create_audit_log(
    db: Session,
    user_id: int,
    action: AuditAction,
    resource: AuditResource,
    resource_id: Optional[int] = None,
    description: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None
) -> Optional[AuditLog]:
    """
    创建操作日志
    
    注意：此函数不提交事务，只刷新到会话。调用方需要负责提交事务。
    如果审计日志记录失败，会记录错误但不影响主业务逻辑。
    """
    try:
        audit_log = AuditLog(
            user_id=user_id,
            action=action.value if isinstance(action, AuditAction) else action,  # 确保使用字符串值
            resource=resource.value if isinstance(resource, AuditResource) else resource,  # 确保使用字符串值
            resource_id=resource_id,
            description=description,
            details=details,
            ip_address=ip_address,
            user_agent=user_agent
        )
        db.add(audit_log)
        # 不在这里提交事务，让调用方统一管理事务
        # 使用flush确保对象状态更新，但不提交事务
        db.flush()
        return audit_log
    except Exception as e:
        # 审计日志记录失败不应影响主业务逻辑
        # 记录错误日志但不抛出异常
        logger.error(
            f"Failed to create audit log: {type(e).__name__}: {str(e)}",
            exc_info=True,
            extra={
                "user_id": user_id,
                "action": action.value if isinstance(action, AuditAction) else action,
                "resource": resource.value if isinstance(resource, AuditResource) else resource,
                "resource_id": resource_id
            }
        )
        return None


def log_task_action(
    db: Session,
    user_id: int,
    action: AuditAction,
    task_id: int,
    description: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    request: Optional[Request] = None
) -> AuditLog:
    """记录任务相关操作"""
    ip_address = get_client_ip(request) if request else None
    user_agent = get_user_agent(request) if request else None
    
    return create_audit_log(
        db=db,
        user_id=user_id,
        action=action,
        resource=AuditResource.TASK,
        resource_id=task_id,
        description=description,
        details=details,
        ip_address=ip_address,
        user_agent=user_agent
    )


def log_work_order_action(
    db: Session,
    user_id: int,
    action: AuditAction,
    work_order_id: int,
    description: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    request: Optional[Request] = None
) -> AuditLog:
    """记录工单相关操作"""
    ip_address = get_client_ip(request) if request else None
    user_agent = get_user_agent(request) if request else None
    
    return create_audit_log(
        db=db,
        user_id=user_id,
        action=action,
        resource=AuditResource.WORK_ORDER,
        resource_id=work_order_id,
        description=description,
        details=details,
        ip_address=ip_address,
        user_agent=user_agent
    )


def log_opportunity_action(
    db: Session,
    user_id: int,
    action: AuditAction,
    opportunity_id: int,
    description: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    request: Optional[Request] = None
) -> AuditLog:
    """记录商机相关操作"""
    ip_address = get_client_ip(request) if request else None
    user_agent = get_user_agent(request) if request else None
    
    return create_audit_log(
        db=db,
        user_id=user_id,
        action=action,
        resource=AuditResource.OPPORTUNITY,
        resource_id=opportunity_id,
        description=description,
        details=details,
        ip_address=ip_address,
        user_agent=user_agent
    )


def log_visit_log_action(
    db: Session,
    user_id: int,
    action: AuditAction,
    visit_log_id: int,
    description: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    request: Optional[Request] = None
) -> AuditLog:
    """记录拜访日志相关操作"""
    ip_address = get_client_ip(request) if request else None
    user_agent = get_user_agent(request) if request else None
    
    return create_audit_log(
        db=db,
        user_id=user_id,
        action=action,
        resource=AuditResource.VISIT_LOG,
        resource_id=visit_log_id,
        description=description,
        details=details,
        ip_address=ip_address,
        user_agent=user_agent
    )


def log_review_action(
    db: Session,
    user_id: int,
    action: AuditAction,
    review_id: int,
    description: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    request: Optional[Request] = None
) -> AuditLog:
    """记录复盘相关操作"""
    ip_address = get_client_ip(request) if request else None
    user_agent = get_user_agent(request) if request else None
    
    return create_audit_log(
        db=db,
        user_id=user_id,
        action=action,
        resource=AuditResource.REVIEW,
        resource_id=review_id,
        description=description,
        details=details,
        ip_address=ip_address,
        user_agent=user_agent
    )


def log_user_action(
    db: Session,
    user_id: int,
    action: AuditAction,
    target_user_id: int,
    description: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    request: Optional[Request] = None
) -> AuditLog:
    """记录用户相关操作"""
    ip_address = get_client_ip(request) if request else None
    user_agent = get_user_agent(request) if request else None
    
    return create_audit_log(
        db=db,
        user_id=user_id,
        action=action,
        resource=AuditResource.USER,
        resource_id=target_user_id,
        description=description,
        details=details,
        ip_address=ip_address,
        user_agent=user_agent
    )


def log_lead_action(
    db: Session,
    user_id: int,
    action: AuditAction,
    lead_id: int,
    description: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    request: Optional[Request] = None
) -> AuditLog:
    """记录线索相关操作"""
    ip_address = get_client_ip(request) if request else None
    user_agent = get_user_agent(request) if request else None
    
    return create_audit_log(
        db=db,
        user_id=user_id,
        action=action,
        resource=AuditResource.LEAD,
        resource_id=lead_id,
        description=description,
        details=details,
        ip_address=ip_address,
        user_agent=user_agent
    )


def log_group_action(
    db: Session,
    user_id: int,
    action: AuditAction,
    group_id: int,
    description: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
    request: Optional[Request] = None
) -> AuditLog:
    """记录组相关操作"""
    ip_address = get_client_ip(request) if request else None
    user_agent = get_user_agent(request) if request else None
    
    return create_audit_log(
        db=db,
        user_id=user_id,
        action=action,
        resource=AuditResource.GROUP,
        resource_id=group_id,
        description=description,
        details=details,
        ip_address=ip_address,
        user_agent=user_agent
    )
