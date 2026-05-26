"""工单标记为已拜访（completed）后的通知与审计等后置逻辑。"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import Request
from sqlalchemy.orm import Session

from app.core.audit import log_work_order_action
from app.models.audit_log import AuditAction
from app.models.notification import NotificationType
from app.models.work_order import WorkOrder, WorkOrderStatus
from app.services.notification_service import (
    mark_notifications_as_read_by_resource,
    notify_work_order_completed,
)

logger = logging.getLogger(__name__)


def set_work_order_completed_at_if_missing(work_order: WorkOrder) -> None:
    if work_order.completed_at is None:
        work_order.completed_at = datetime.now(timezone.utc)


def post_commit_work_order_completed_followup(
    db: Session,
    work_order: WorkOrder,
    *,
    actor_user_id: int,
    request: Optional[Request],
    old_status: str,
    audit_description: str,
    audit_trigger: str,
) -> None:
    """主事务已提交后调用：已读、工单已拜访通知、工单审计。"""
    try:
        mark_notifications_as_read_by_resource(
            db=db,
            user_id=actor_user_id,
            resource_type="work_order",
            resource_id=work_order.id,
            notification_types=[NotificationType.WORK_ORDER_ACCEPTED],
        )
    except Exception as e:
        logger.error("Failed to mark notifications as read: %s", e, exc_info=True)

    try:
        notify_work_order_completed(db, work_order)
    except Exception as e:
        logger.error("Failed to send work order completed notification: %s", e, exc_info=True)

    try:
        log_work_order_action(
            db=db,
            user_id=actor_user_id,
            action=AuditAction.UPDATE,
            work_order_id=work_order.id,
            description=audit_description,
            details={
                "old_status": old_status,
                "new_status": WorkOrderStatus.COMPLETED.value,
                "task_name": work_order.task.task_name if work_order.task else None,
                "trigger": audit_trigger,
            },
            request=request,
        )
        db.commit()
    except Exception as e:
        logger.error("Failed to log work order completion action: %s", e, exc_info=True)
