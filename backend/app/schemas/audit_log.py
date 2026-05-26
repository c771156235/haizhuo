"""
操作日志相关的 Pydantic 模式
"""
from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime
from app.models.audit_log import AuditAction, AuditResource


class AuditLogBase(BaseModel):
    """操作日志基础模式"""
    action: AuditAction
    resource: AuditResource
    resource_id: Optional[int] = None
    description: Optional[str] = None
    details: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None


class AuditLogCreate(AuditLogBase):
    """创建操作日志"""
    user_id: int


class AuditLogResponse(AuditLogBase):
    """操作日志响应"""
    id: int
    user_id: int
    user_name: Optional[str] = None
    user_username: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class AuditLogListParams(BaseModel):
    """操作日志列表查询参数"""
    user_id: Optional[int] = None
    action: Optional[AuditAction] = None
    resource: Optional[AuditResource] = None
    resource_id: Optional[int] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    page: int = 1
    page_size: int = 20

