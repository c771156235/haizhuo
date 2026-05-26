"""
操作日志 API
"""
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy.orm import Session, joinedload
from datetime import datetime
from app.database import get_db
from app.models.user import User, UserRole
from app.models.audit_log import AuditLog, AuditAction, AuditResource
from app.schemas.audit_log import AuditLogResponse, AuditLogListParams
from app.schemas.common import PaginatedResponse
from app.api.deps import get_current_user, require_role

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/audit-logs", tags=["操作日志"])


def _coerce_audit_resource(raw) -> AuditResource:
    if isinstance(raw, AuditResource):
        return raw
    try:
        return AuditResource(raw)
    except ValueError:
        logger.warning("audit_logs: unknown resource value %r, mapped to UNKNOWN", raw)
        return AuditResource.UNKNOWN


@router.get("", response_model=PaginatedResponse[AuditLogResponse])
def get_audit_logs(
    user_id: Optional[int] = Query(None, description="用户ID筛选"),
    action: Optional[AuditAction] = Query(None, description="操作类型筛选"),
    resource: Optional[AuditResource] = Query(None, description="操作对象类型筛选"),
    resource_id: Optional[int] = Query(None, description="操作对象ID筛选"),
    start_date: Optional[datetime] = Query(None, description="开始日期"),
    end_date: Optional[datetime] = Query(None, description="结束日期"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    user_role: tuple = Depends(require_role(UserRole.MANAGER)),
    db: Session = Depends(get_db)
):
    """获取操作日志列表（仅总管可见）"""
    query = db.query(AuditLog).options(joinedload(AuditLog.user))
    
    # 筛选条件
    if user_id:
        query = query.filter(AuditLog.user_id == user_id)
    if action:
        # 使用枚举值（字符串）进行筛选
        action_value = action.value if isinstance(action, AuditAction) else action
        query = query.filter(AuditLog.action == action_value)
    if resource:
        # 使用枚举值（字符串）进行筛选
        resource_value = resource.value if isinstance(resource, AuditResource) else resource
        query = query.filter(AuditLog.resource == resource_value)
    if resource_id:
        query = query.filter(AuditLog.resource_id == resource_id)
    if start_date:
        query = query.filter(AuditLog.created_at >= start_date)
    if end_date:
        query = query.filter(AuditLog.created_at <= end_date)
    
    # 获取总数
    total = query.count()
    
    # 分页
    from app.schemas.common import PaginationParams
    pagination = PaginationParams(page=page, page_size=page_size)
    audit_logs = query.order_by(AuditLog.created_at.desc()).offset(pagination.skip).limit(pagination.limit).all()
    
    # 转换为响应格式
    audit_log_responses = []
    for log in audit_logs:
        # 将字符串值转换为枚举对象（如果还不是枚举）
        action_enum = log.action if isinstance(log.action, AuditAction) else AuditAction(log.action)
        resource_enum = _coerce_audit_resource(log.resource)
        
        audit_log_responses.append(AuditLogResponse(
            id=log.id,
            user_id=log.user_id,
            user_name=log.user.real_name if log.user else None,
            user_username=log.user.username if log.user else None,
            action=action_enum,
            resource=resource_enum,
            resource_id=log.resource_id,
            description=log.description,
            details=log.details,
            ip_address=log.ip_address,
            user_agent=log.user_agent,
            created_at=log.created_at
        ))
    
    return PaginatedResponse.create(audit_log_responses, total, page, page_size)


@router.get("/{audit_log_id}", response_model=AuditLogResponse)
def get_audit_log(
    audit_log_id: int,
    user_role: tuple = Depends(require_role(UserRole.MANAGER)),
    db: Session = Depends(get_db)
):
    """获取操作日志详情（仅总管可见）"""
    current_user, current_role = user_role
    audit_log = db.query(AuditLog).options(joinedload(AuditLog.user)).filter(AuditLog.id == audit_log_id).first()
    
    if not audit_log:
        raise HTTPException(status_code=404, detail="操作日志不存在")
    
    # 将字符串值转换为枚举对象（如果还不是枚举）
    action_enum = audit_log.action if isinstance(audit_log.action, AuditAction) else AuditAction(audit_log.action)
    resource_enum = _coerce_audit_resource(audit_log.resource)
    
    return AuditLogResponse(
        id=audit_log.id,
        user_id=audit_log.user_id,
        user_name=audit_log.user.real_name if audit_log.user else None,
        user_username=audit_log.user.username if audit_log.user else None,
        action=action_enum,
        resource=resource_enum,
        resource_id=audit_log.resource_id,
        description=audit_log.description,
        details=audit_log.details,
        ip_address=audit_log.ip_address,
        user_agent=audit_log.user_agent,
        created_at=audit_log.created_at
    )


@router.delete("/{audit_log_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_audit_log(
    audit_log_id: int,
    user_role: tuple = Depends(require_role(UserRole.MANAGER)),
    db: Session = Depends(get_db),
):
    """删除单条操作日志（仅总管）"""
    audit_log = db.query(AuditLog).filter(AuditLog.id == audit_log_id).first()
    if not audit_log:
        raise HTTPException(status_code=404, detail="操作日志不存在")
    db.delete(audit_log)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)

