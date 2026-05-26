"""
通知服务：用于创建和管理通知
"""
from sqlalchemy.orm import Session
from datetime import datetime
from typing import TYPE_CHECKING, Optional

from app.models.notification import Notification, NotificationType
from app.models.task import Task
from app.models.work_order import WorkOrder
from app.models.opportunity import Opportunity
from app.models.visit_log import VisitLog
from app.models.review import Review
from app.models.lead import Lead

if TYPE_CHECKING:
    from app.models.user import User
else:
    from app.models.user import User


def create_notification(
    db: Session,
    user_id: int,
    notification_type: NotificationType,
    title: str,
    content: str = None,
    resource_type: str = None,
    resource_id: int = None
) -> Notification:
    """
    创建通知
    
    注意：此函数不提交事务，只刷新到会话。调用方需要负责提交事务。
    如果通知创建失败，会记录错误但不影响主业务逻辑。
    """
    try:
        # 将枚举值转换为字符串存储
        notification = Notification(
            user_id=user_id,
            notification_type=notification_type.value if isinstance(notification_type, NotificationType) else str(notification_type),
            title=title,
            content=content,
            resource_type=resource_type,
            resource_id=resource_id,
            is_read=False
        )
        db.add(notification)
        # 不在这里提交事务，让调用方统一管理事务
        # 使用flush确保对象状态更新，但不提交事务
        db.flush()
        db.refresh(notification)
        return notification
    except Exception as e:
        # 通知创建失败不应影响主业务逻辑
        # 记录错误日志但不抛出异常
        import logging
        logger = logging.getLogger(__name__)
        logger.error(
            f"Failed to create notification: {type(e).__name__}: {str(e)}",
            exc_info=True,
            extra={
                "user_id": user_id,
                "notification_type": notification_type.value if isinstance(notification_type, NotificationType) else str(notification_type),
                "resource_type": resource_type,
                "resource_id": resource_id
            }
        )
        # 返回None表示创建失败，调用方可以检查返回值
        return None


def notify_task_pending(db: Session, task: Task):
    """通知待确认任务 - 发送给所有总管"""
    from app.models.user import UserRole, User as UserModel, UserRoleAssociation
    
    # 查询所有总管（现在需要从UserRoleAssociation表中查询）
    manager_role_ids = db.query(UserRoleAssociation.user_id).filter(
        UserRoleAssociation.role == UserRole.MANAGER,
        UserRoleAssociation.approval_status == "approved",
        UserRoleAssociation.is_active == True
    ).distinct().all()
    manager_ids = [mid[0] for mid in manager_role_ids]
    
    if not manager_ids:
        return
    
    # 确保总管用户是活跃的
    managers = db.query(UserModel).filter(
        UserModel.id.in_(manager_ids),
        UserModel.is_active == True
    ).all()
    
    # 给每个总管发送通知
    for manager in managers:
        create_notification(
            db=db,
            user_id=manager.id,
            notification_type=NotificationType.TASK_PENDING,
            title=f"待确认任务：{task.task_name}",
            content=f"任务「{task.task_name}」（销售单位：{task.sales_unit}）已创建，等待您的确认。",
            resource_type="task",
            resource_id=task.id
        )
    
    # 提交事务，确保通知被保存
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to commit task pending notifications: {str(e)}", exc_info=True)


def notify_task_confirmed(db: Session, task: Task, sales_contact_ids: list[int] = None):
    """通知任务已确认"""
    has_notifications = False
    # 通知任务发起人（专项任务发起人）
    if task.initiator_id:
        create_notification(
            db=db,
            user_id=task.initiator_id,
            notification_type=NotificationType.TASK_CONFIRMED,
            title=f"任务已确认：{task.task_name}",
            content=f"您发起的任务「{task.task_name}」已被总管确认，已派发给销售单位接口人。",
            resource_type="task",
            resource_id=task.id
        )
        has_notifications = True
    
    # 如果提供了销售单位接口人ID列表，通知所有这些人
    if sales_contact_ids:
        for contact_id in sales_contact_ids:
            create_notification(
                db=db,
                user_id=contact_id,
                notification_type=NotificationType.TASK_CONFIRMED,
                title=f"任务已确认：{task.task_name}",
                content=f"任务「{task.task_name}」已被总管确认，请填写详细需求单。",
                resource_type="task",
                resource_id=task.id
            )
            has_notifications = True
    # 兼容旧逻辑：如果任务有单个sales_contact_id，也发送通知
    elif task.sales_contact_id:
        create_notification(
            db=db,
            user_id=task.sales_contact_id,
            notification_type=NotificationType.TASK_CONFIRMED,
            title=f"任务已确认：{task.task_name}",
            content=f"任务「{task.task_name}」已被总管确认，请填写详细需求单。",
            resource_type="task",
            resource_id=task.id
        )
        has_notifications = True
    
    # 注意：此函数在调用方事务中调用，调用方会提交事务，但为了保险起见也提交
    # 如果调用方已提交，这里提交不会有问题
    if has_notifications:
        try:
            db.commit()
        except Exception as e:
            db.rollback()
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to commit task confirmed notification: {str(e)}", exc_info=True)


def notify_task_rejected(db: Session, task: Task):
    """通知任务已拒绝"""
    if task.initiator_id:
        create_notification(
            db=db,
            user_id=task.initiator_id,
            notification_type=NotificationType.TASK_REJECTED,
            title=f"任务已拒绝：{task.task_name}",
            content=f"任务「{task.task_name}」已被总管拒绝。拒绝原因：{task.rejection_reason or '无'}",
            resource_type="task",
            resource_id=task.id
        )
        # 注意：此函数在调用方事务中调用，调用方会提交事务，但为了保险起见也提交
        # 如果调用方已提交，这里提交不会有问题
        try:
            db.commit()
        except Exception as e:
            db.rollback()
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to commit task rejected notification: {str(e)}", exc_info=True)


def notify_task_detail_submitted(db: Session, task: Task):
    """通知详细需求已提交 - 发送给所有总管"""
    from app.models.user import UserRole, User as UserModel, UserRoleAssociation
    
    # 查询所有总管（现在需要从UserRoleAssociation表中查询）
    manager_role_ids = db.query(UserRoleAssociation.user_id).filter(
        UserRoleAssociation.role == UserRole.MANAGER,
        UserRoleAssociation.approval_status == "approved",
        UserRoleAssociation.is_active == True
    ).distinct().all()
    manager_ids = [mid[0] for mid in manager_role_ids]
    
    if not manager_ids:
        return
    
    # 确保总管用户是活跃的
    managers = db.query(UserModel).filter(
        UserModel.id.in_(manager_ids),
        UserModel.is_active == True
    ).all()
    
    # 给每个总管发送通知
    for manager in managers:
        create_notification(
            db=db,
            user_id=manager.id,
            notification_type=NotificationType.TASK_DETAIL_SUBMITTED,
            title=f"详细需求已提交：{task.task_name}",
            content=f"任务「{task.task_name}」的详细需求单已提交，请进行派单。",
            resource_type="task",
            resource_id=task.id
        )
    
    # 提交事务，确保通知被保存
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to commit task detail submitted notifications: {str(e)}", exc_info=True)


def notify_work_order_pool_dispatch(
    db: Session, task: Task, team_leader_id: int, work_order_id: int
):
    """组内待认领：通知该组各组长有一条工单可认领（同一条工单，多人均收到通知）。"""
    create_notification(
        db=db,
        user_id=team_leader_id,
        notification_type=NotificationType.TASK_DISPATCHED,
        title=f"待认领工单：{task.task_name}",
        content=f"任务「{task.task_name}」已派至您所在组，请尽快认领后转派成员。",
        resource_type="work_order",
        resource_id=work_order_id
    )
    # 与 notify_task_dispatched 一致，独立 commit 保证写入
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to commit pool dispatch notification: {str(e)}", exc_info=True)


def notify_task_dispatched(db: Session, task: Task, team_leader_id: int, work_order_id: int):
    """通知任务已派单（认领后转派等场景）"""
    create_notification(
        db=db,
        user_id=team_leader_id,
        notification_type=NotificationType.TASK_DISPATCHED,
        title=f"任务已派单：{task.task_name}",
        content=f"任务「{task.task_name}」已派单给您，请转派给具体成员。",
        resource_type="work_order",
        resource_id=work_order_id
    )
    # 注意：此函数在调用方事务中调用，调用方会提交事务，但为了保险起见也提交
    # 如果调用方已提交，这里提交不会有问题
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to commit task dispatched notification: {str(e)}", exc_info=True)


def notify_task_revoked(db: Session, task: Task):
    """通知任务已撤回 - 通知总管"""
    from app.models.user import UserRole, User as UserModel, UserRoleAssociation
    
    # 如果任务有总管，通知总管
    if task.manager_id:
        create_notification(
            db=db,
            user_id=task.manager_id,
            notification_type=NotificationType.TASK_REJECTED,  # 使用已拒绝类型，因为任务被撤回
            title=f"任务已撤回：{task.task_name}",
            content=f"任务「{task.task_name}」已被创建者撤回，状态已重置为草稿。",
            resource_type="task",
            resource_id=task.id
        )
    else:
        # 如果没有总管，通知所有总管（任务可能还在待确认状态）
        manager_role_ids = db.query(UserRoleAssociation.user_id).filter(
            UserRoleAssociation.role == UserRole.MANAGER,
            UserRoleAssociation.approval_status == "approved",
            UserRoleAssociation.is_active == True
        ).distinct().all()
        manager_ids = [mid[0] for mid in manager_role_ids]
        
        if manager_ids:
            managers = db.query(UserModel).filter(
                UserModel.id.in_(manager_ids),
                UserModel.is_active == True
            ).all()
            
            for manager in managers:
                create_notification(
                    db=db,
                    user_id=manager.id,
                    notification_type=NotificationType.TASK_REJECTED,
                    title=f"任务已撤回：{task.task_name}",
                    content=f"任务「{task.task_name}」已被创建者撤回，状态已重置为草稿。",
                    resource_type="task",
                    resource_id=task.id
                )
    
    # 提交事务，确保通知被保存
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to commit task revoked notifications: {str(e)}", exc_info=True)


def notify_work_order_assigned(db: Session, work_order: WorkOrder):
    """通知工单已分配"""
    if work_order.member_id:
        create_notification(
            db=db,
            user_id=work_order.member_id,
            notification_type=NotificationType.WORK_ORDER_ASSIGNED,
            title=f"工单已分配：{work_order.work_order_no}",
            content=f"工单「{work_order.work_order_no}」已分配给您，请及时接单。",
            resource_type="work_order",
            resource_id=work_order.id
        )
        # 提交事务，确保通知被保存
        try:
            db.commit()
        except Exception as e:
            db.rollback()
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to commit work order assigned notification: {str(e)}", exc_info=True)


def notify_work_order_accepted(db: Session, work_order: WorkOrder):
    """通知工单已接单"""
    if work_order.team_leader_id:
        create_notification(
            db=db,
            user_id=work_order.team_leader_id,
            notification_type=NotificationType.WORK_ORDER_ACCEPTED,
            title=f"工单已接单：{work_order.work_order_no}",
            content=f"工单「{work_order.work_order_no}」已被成员接单。",
            resource_type="work_order",
            resource_id=work_order.id
        )
        # 注意：此函数在调用方事务中调用，调用方会提交事务，但为了保险起见也提交
        # 如果调用方已提交，这里提交不会有问题
        try:
            db.commit()
        except Exception as e:
            db.rollback()
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to commit work order accepted notification: {str(e)}", exc_info=True)


def notify_work_order_completed(db: Session, work_order: WorkOrder):
    """通知工单已拜访（标记完成）"""
    # 通知总管和任务发起人
    task = work_order.task
    if task:
        # 通知总管
        if task.manager_id:
            create_notification(
                db=db,
                user_id=task.manager_id,
                notification_type=NotificationType.WORK_ORDER_COMPLETED,
                title=f"工单已拜访：{work_order.work_order_no}",
                content=f"工单「{work_order.work_order_no}」（任务：{task.task_name}）已标记为已拜访。",
                resource_type="work_order",
                resource_id=work_order.id
            )
        # 通知任务发起人
        if task.initiator_id:
            create_notification(
                db=db,
                user_id=task.initiator_id,
                notification_type=NotificationType.WORK_ORDER_COMPLETED,
                title=f"工单已拜访：{work_order.work_order_no}",
                content=f"工单「{work_order.work_order_no}」（任务：{task.task_name}）已标记为已拜访。",
                resource_type="work_order",
                resource_id=work_order.id
            )
        # 提交事务，确保通知被保存
        try:
            db.commit()
        except Exception as e:
            db.rollback()
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to commit work order completed notification: {str(e)}", exc_info=True)


def notify_work_order_cancelled(db: Session, work_order: WorkOrder, cancelled_by_user_id: int):
    """通知工单已取消"""
    task = work_order.task
    cancellation_reason_text = f"，取消原因：{work_order.cancellation_reason}" if work_order.cancellation_reason else ""
    
    # 通知对象列表
    notify_user_ids = []
    
    # 通知总管
    if task and task.manager_id and task.manager_id != cancelled_by_user_id:
        notify_user_ids.append(task.manager_id)
    
    # 通知任务发起人
    if task and task.initiator_id and task.initiator_id != cancelled_by_user_id:
        notify_user_ids.append(task.initiator_id)
    
    # 如果是成员取消，通知组长
    if work_order.team_leader_id and work_order.team_leader_id != cancelled_by_user_id:
        notify_user_ids.append(work_order.team_leader_id)
    
    # 如果是组长取消，通知成员（如果已分配）
    if work_order.member_id and work_order.member_id != cancelled_by_user_id:
        notify_user_ids.append(work_order.member_id)
    
    # 去重并发送通知
    for user_id in set(notify_user_ids):
        create_notification(
            db=db,
            user_id=user_id,
            notification_type=NotificationType.WORK_ORDER_CANCELLED,
            title=f"工单已取消：{work_order.work_order_no}",
            content=f"工单「{work_order.work_order_no}」（任务：{task.task_name if task else ''}）已被取消{cancellation_reason_text}。",
            resource_type="work_order",
            resource_id=work_order.id
        )
    
    # 提交事务，确保通知被保存
    if notify_user_ids:
        try:
            db.commit()
        except Exception as e:
            db.rollback()
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to commit work order cancelled notification: {str(e)}", exc_info=True)


def notify_visit_log_created(db: Session, visit_log: VisitLog):
    """通知拜访日志已创建"""
    # 通知组长进行复盘
    work_order = visit_log.work_order
    if work_order and work_order.team_leader_id:
        create_notification(
            db=db,
            user_id=work_order.team_leader_id,
            notification_type=NotificationType.VISIT_LOG_CREATED,
            title=f"新的拜访日志：{work_order.work_order_no}",
            content=f"成员已提交新的拜访日志，请进行复盘。",
            resource_type="visit_log",
            resource_id=visit_log.id
        )
        # 提交事务，确保通知被保存
        try:
            db.commit()
        except Exception as e:
            db.rollback()
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to commit visit log created notification: {str(e)}", exc_info=True)


def notify_review_created(db: Session, review: Review):
    """通知复盘已创建"""
    # 通知成员复盘已完成
    visit_log = review.visit_log
    if visit_log and visit_log.member_id:
        create_notification(
            db=db,
            user_id=visit_log.member_id,
            notification_type=NotificationType.REVIEW_CREATED,
            title=f"复盘已完成：{visit_log.work_order.work_order_no if visit_log.work_order else ''}",
            content=f"您的拜访日志已完成复盘，请查看批注内容。",
            resource_type="review",
            resource_id=review.id
        )
        # 提交事务，确保通知被保存
        try:
            db.commit()
        except Exception as e:
            db.rollback()
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to commit review created notification: {str(e)}", exc_info=True)


def notify_opportunity_created(db: Session, opportunity: Opportunity):
    """通知商机已创建"""
    # 通知总管
    task = opportunity.task
    if task and task.manager_id:
        create_notification(
            db=db,
            user_id=task.manager_id,
            notification_type=NotificationType.OPPORTUNITY_CREATED,
            title=f"新商机：{opportunity.opportunity_no}",
            content=f"任务「{task.task_name}」中产生了新商机「{opportunity.opportunity_no}」。",
            resource_type="opportunity",
            resource_id=opportunity.id
        )
        # 提交事务，确保通知被保存
        try:
            db.commit()
        except Exception as e:
            db.rollback()
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to commit opportunity created notification: {str(e)}", exc_info=True)


def notify_opportunity_status_changed(db: Session, opportunity: Opportunity, old_status: str):
    """通知商机状态已变更"""
    # 通知总管
    task = opportunity.task
    if task and task.manager_id:
        status_labels = {
            "created": "已创建",
            "in_progress": "进行中",
            "lost": "流失",
            "won": "转定"
        }
        new_status_label = status_labels.get(str(opportunity.status.value), str(opportunity.status))
        create_notification(
            db=db,
            user_id=task.manager_id,
            notification_type=NotificationType.OPPORTUNITY_STATUS_CHANGED,
            title=f"商机状态变更：{opportunity.opportunity_no}",
            content=f"商机「{opportunity.opportunity_no}」状态已变更为「{new_status_label}」。",
            resource_type="opportunity",
            resource_id=opportunity.id
        )
        # 注意：此函数在调用方事务中调用，调用方会提交事务，但为了保险起见也提交
        # 如果调用方已提交，这里提交不会有问题
        try:
            db.commit()
        except Exception as e:
            db.rollback()
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to commit opportunity status changed notification: {str(e)}", exc_info=True)


def notify_user_registration_pending(db: Session, user: User):
    """通知用户注册待审核 - 发送给所有总管（每个用户只发送一次）"""
    from app.models.user import UserRole, User as UserModel
    
    # 检查是否已经为该用户发送过注册待审核通知
    # 避免多角色注册时重复发送通知
    existing_notification = db.query(Notification).filter(
        Notification.notification_type == NotificationType.USER_REGISTRATION_PENDING.value,
        Notification.resource_type == "user",
        Notification.resource_id == user.id
    ).first()
    
    # 如果已经发送过通知，不再重复发送
    if existing_notification:
        return
    
    # 查询所有总管（现在需要从UserRoleAssociation表中查询）
    from app.models.user import UserRoleAssociation
    manager_role_ids = db.query(UserRoleAssociation.user_id).filter(
        UserRoleAssociation.role == UserRole.MANAGER,
        UserRoleAssociation.approval_status == "approved",
        UserRoleAssociation.is_active == True
    ).distinct().all()
    manager_ids = [mid[0] for mid in manager_role_ids]
    
    if not manager_ids:
        return
    
    # 确保总管用户是活跃的
    managers = db.query(UserModel).filter(
        UserModel.id.in_(manager_ids),
        UserModel.is_active == True
    ).all()
    
    # 给每个总管发送通知
    for manager in managers:
        create_notification(
            db=db,
            user_id=manager.id,
            notification_type=NotificationType.USER_REGISTRATION_PENDING,
            title=f"新用户注册待审核：{user.real_name or user.username}",
            content=f"用户「{user.real_name or user.username}」（{user.username}）已提交注册申请，请及时审核。",
            resource_type="user",
            resource_id=user.id
        )
    
    # 提交事务，确保通知被保存
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to commit user registration pending notifications: {str(e)}", exc_info=True)


def notify_user_approved(db: Session, user: User):
    """通知用户审核通过"""
    create_notification(
        db=db,
        user_id=user.id,
        notification_type=NotificationType.USER_APPROVED,
        title="注册审核已通过",
        content=f"您的注册申请已通过审核，现在可以登录系统了。",
        resource_type="user",
        resource_id=user.id
    )


def notify_user_rejected(db: Session, user: User, rejection_reason: str):
    """通知用户审核拒绝"""
    create_notification(
        db=db,
        user_id=user.id,
        notification_type=NotificationType.USER_REJECTED,
        title="注册审核未通过",
        content=f"您的注册申请未通过审核。拒绝原因：{rejection_reason}",
        resource_type="user",
        resource_id=user.id
    )


def notify_lead_created(db: Session, lead: Lead):
    """通知线索已创建"""
    has_notifications = False
    # 通知组长（通过拜访日志关联的工单获取组长）
    visit_log = lead.visit_log
    if visit_log and visit_log.work_order and visit_log.work_order.team_leader_id:
        create_notification(
            db=db,
            user_id=visit_log.work_order.team_leader_id,
            notification_type=NotificationType.LEAD_CREATED,
            title=f"新线索：{lead.customer_name}",
            content=f"成员已创建新线索「{lead.customer_name}」（任务：{lead.task.task_name if lead.task else ''}），请及时查看。",
            resource_type="lead",
            resource_id=lead.id
        )
        has_notifications = True
    
    # 通知总管（通过任务获取总管）
    if lead.task and lead.task.manager_id:
        create_notification(
            db=db,
            user_id=lead.task.manager_id,
            notification_type=NotificationType.LEAD_CREATED,
            title=f"新线索：{lead.customer_name}",
            content=f"任务「{lead.task.task_name}」中产生了新线索「{lead.customer_name}」。",
            resource_type="lead",
            resource_id=lead.id
        )
        has_notifications = True
    
    # 提交事务，确保通知被保存
    if has_notifications:
        try:
            db.commit()
        except Exception as e:
            db.rollback()
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to commit lead created notification: {str(e)}", exc_info=True)


def notify_collaborative_member_added(db: Session, opportunity: Opportunity, member_id: int):
    """通知协同人员已添加"""
    create_notification(
        db=db,
        user_id=member_id,
        notification_type=NotificationType.COLLABORATIVE_MEMBER_ADDED,
        title=f"您已被添加为协同人员：{opportunity.opportunity_no}",
        content=f"您已被添加为商机「{opportunity.opportunity_no}」（客户：{opportunity.customer_unit}）的协同人员，请及时查看。",
        resource_type="opportunity",
        resource_id=opportunity.id
    )
    # 提交事务，确保通知被保存
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to commit collaborative member added notification: {str(e)}", exc_info=True)


def notify_work_order_revoked_by_team_leader_change(db: Session, work_order: WorkOrder, member_id: int):
    """通知成员工单已撤回（因修改组长）"""
    task = work_order.task
    create_notification(
        db=db,
        user_id=member_id,
        notification_type=NotificationType.WORK_ORDER_ASSIGNED,  # 复用现有类型，或可以新增 WORK_ORDER_REVOKED
        title=f"工单已撤回：{work_order.work_order_no}",
        content=f"工单「{work_order.work_order_no}」（任务：{task.task_name if task else ''}）因组长变更已被撤回，请等待新组长重新转派。",
        resource_type="work_order",
        resource_id=work_order.id
    )
    # 提交事务，确保通知被保存
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to commit work order revoked by team leader change notification: {str(e)}", exc_info=True)


def notify_work_order_team_leader_changed(db: Session, work_order: WorkOrder, old_team_leader_id: int):
    """通知原组长工单已重新分配"""
    task = work_order.task
    create_notification(
        db=db,
        user_id=old_team_leader_id,
        notification_type=NotificationType.WORK_ORDER_ASSIGNED,  # 复用现有类型，或可以新增 WORK_ORDER_TEAM_LEADER_CHANGED
        title=f"工单已重新分配：{work_order.work_order_no}",
        content=f"工单「{work_order.work_order_no}」（任务：{task.task_name if task else ''}）已被重新分配给其他组长。",
        resource_type="work_order",
        resource_id=work_order.id
    )
    # 提交事务，确保通知被保存
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to commit work order team leader changed notification: {str(e)}", exc_info=True)


def notify_work_order_revoked(db: Session, work_order: WorkOrder, member_id: int):
    """通知成员工单已撤回（组长撤回转派）"""
    task = work_order.task
    create_notification(
        db=db,
        user_id=member_id,
        notification_type=NotificationType.WORK_ORDER_ASSIGNED,  # 复用现有类型
        title=f"工单已撤回：{work_order.work_order_no}",
        content=f"工单「{work_order.work_order_no}」（任务：{task.task_name if task else ''}）已被组长撤回，请等待重新转派。",
        resource_type="work_order",
        resource_id=work_order.id
    )
    # 提交事务，确保通知被保存
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to commit work order revoked notification: {str(e)}", exc_info=True)


def notify_work_order_cancelled_by_peer_dispatch(
    db: Session,
    work_order: WorkOrder,
    operator_id: int,
    operator_name: Optional[str] = None
):
    """通知组长：该工单已被同组其他组长处理。"""
    if not work_order.team_leader_id or work_order.team_leader_id == operator_id:
        return

    task = work_order.task
    operator_text = operator_name or "同组其他组长"
    create_notification(
        db=db,
        user_id=work_order.team_leader_id,
        notification_type=NotificationType.WORK_ORDER_CANCELLED,
        title=f"工单已由他人处理：{work_order.work_order_no}",
        content=(
            f"工单「{work_order.work_order_no}」（任务：{task.task_name if task else ''}）"
            f"已由{operator_text}先行转派给成员，当前工单已自动失效。"
        ),
        resource_type="work_order",
        resource_id=work_order.id
    )
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Failed to commit peer dispatch cancelled notification: {str(e)}", exc_info=True)


def notify_work_order_transferred_by_member(
    db: Session,
    work_order: WorkOrder,
    old_team_leader_id: int,
    old_member_id: int,
    target_mode: str,
    target_member_id: Optional[int] = None,
    target_team_leader_id: Optional[int] = None,
    operator_id: Optional[int] = None,
):
    """通知成员转单结果（同组转成员 / 跨组转组长）"""
    task = work_order.task
    notify_user_ids: list[int] = []

    if target_mode == "member":
        if target_member_id:
            create_notification(
                db=db,
                user_id=target_member_id,
                notification_type=NotificationType.WORK_ORDER_ASSIGNED,
                title=f"工单待接单：{work_order.work_order_no}",
                content=f"工单「{work_order.work_order_no}」（任务：{task.task_name if task else ''}）已由成员转单给您，请及时接单。",
                resource_type="work_order",
                resource_id=work_order.id
            )
            notify_user_ids.append(target_member_id)
        if old_team_leader_id and old_team_leader_id != operator_id:
            create_notification(
                db=db,
                user_id=old_team_leader_id,
                notification_type=NotificationType.WORK_ORDER_ASSIGNED,
                title=f"成员已转单：{work_order.work_order_no}",
                content=f"工单「{work_order.work_order_no}」（任务：{task.task_name if task else ''}）已在组内转单，当前待新成员接单。",
                resource_type="work_order",
                resource_id=work_order.id
            )
            notify_user_ids.append(old_team_leader_id)
    elif target_mode == "team_leader":
        if target_team_leader_id:
            create_notification(
                db=db,
                user_id=target_team_leader_id,
                notification_type=NotificationType.TASK_DISPATCHED,
                title=f"收到跨组转单：{work_order.work_order_no}",
                content=f"工单「{work_order.work_order_no}」（任务：{task.task_name if task else ''}）已跨组转给您，请转派给组内成员。",
                resource_type="work_order",
                resource_id=work_order.id
            )
            notify_user_ids.append(target_team_leader_id)
        if old_team_leader_id and old_team_leader_id != operator_id:
            create_notification(
                db=db,
                user_id=old_team_leader_id,
                notification_type=NotificationType.WORK_ORDER_ASSIGNED,
                title=f"工单已跨组转出：{work_order.work_order_no}",
                content=f"工单「{work_order.work_order_no}」（任务：{task.task_name if task else ''}）已被成员跨组转给其他组长。",
                resource_type="work_order",
                resource_id=work_order.id
            )
            notify_user_ids.append(old_team_leader_id)
    else:
        return

    if notify_user_ids and old_member_id and old_member_id != operator_id:
        create_notification(
            db=db,
            user_id=old_member_id,
            notification_type=NotificationType.WORK_ORDER_ASSIGNED,
            title=f"转单已完成：{work_order.work_order_no}",
            content=f"您发起的工单「{work_order.work_order_no}」转单已完成。",
            resource_type="work_order",
            resource_id=work_order.id
        )
        notify_user_ids.append(old_member_id)

    if notify_user_ids:
        try:
            db.commit()
        except Exception as e:
            db.rollback()
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to commit work order transfer notifications: {str(e)}", exc_info=True)


def mark_notifications_as_read_by_resource(
    db: Session,
    user_id: int,
    resource_type: str,
    resource_id: int,
    notification_types: list[NotificationType] = None
):
    """
    根据资源类型和ID自动标记相关通知为已读
    
    当用户通过待办列表或其他方式处理业务事项时，自动标记相关的通知为已读
    
    Args:
        db: 数据库会话
        user_id: 用户ID（只标记该用户的通知）
        resource_type: 资源类型（如 "task", "work_order" 等）
        resource_id: 资源ID
        notification_types: 要标记的通知类型列表（如果为None，则标记所有相关通知）
    """
    from datetime import datetime
    
    try:
        query = db.query(Notification).filter(
            Notification.user_id == user_id,
            Notification.resource_type == resource_type,
            Notification.resource_id == resource_id,
            Notification.is_read == False
        )
        
        # 如果指定了通知类型，则只标记这些类型的通知
        if notification_types:
            type_values = [nt.value if isinstance(nt, NotificationType) else str(nt) for nt in notification_types]
            query = query.filter(Notification.notification_type.in_(type_values))
        
        # 批量更新为已读
        count = query.update({
            Notification.is_read: True,
            Notification.read_at: datetime.utcnow()
        })
        
        # 不在这里提交事务，让调用方统一管理事务
        # 使用flush确保对象状态更新，但不提交事务
        db.flush()
        
        return count
    except Exception as e:
        # 标记失败不应影响主业务逻辑
        import logging
        logger = logging.getLogger(__name__)
        logger.error(
            f"Failed to mark notifications as read: {type(e).__name__}: {str(e)}",
            exc_info=True,
            extra={
                "user_id": user_id,
                "resource_type": resource_type,
                "resource_id": resource_id,
                "notification_types": [nt.value if isinstance(nt, NotificationType) else str(nt) for nt in notification_types] if notification_types else None
            }
        )
        return 0