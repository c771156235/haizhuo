"""
数据库模型
"""
from app.models.user import User, UserRole, UserRoleAssociation, ApprovalStatus
from app.models.task import Task, TaskStatus, TaskDetailRequirement
from app.models.work_order import WorkOrder, WorkOrderStatus
from app.models.opportunity import Opportunity, OpportunityStatus, CollaborativeMember
from app.models.visit_log import VisitLog
from app.models.visit_log_maintenance_log import VisitLogMaintenanceLog
from app.models.lead import Lead
from app.models.review import Review
from app.models.audit_log import AuditLog, AuditAction, AuditResource
from app.models.notification import Notification, NotificationType
from app.models.group import Group, group_members
from app.models.option_config import OptionConfig, OptionType

__all__ = [
    "User",
    "UserRole",
    "UserRoleAssociation",
    "ApprovalStatus",
    "Task",
    "TaskStatus",
    "TaskDetailRequirement",
    "WorkOrder",
    "WorkOrderStatus",
    "Opportunity",
    "OpportunityStatus",
    "CollaborativeMember",
    "VisitLog",
    "VisitLogMaintenanceLog",
    "Lead",
    "Review",
    "AuditLog",
    "AuditAction",
    "AuditResource",
    "Notification",
    "NotificationType",
    "Group",
    "group_members",
    "OptionConfig",
    "OptionType",
]

