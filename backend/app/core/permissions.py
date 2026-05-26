"""
权限管理
"""
from typing import List, Optional
from sqlalchemy.orm import Session
from app.models.user import UserRole
from app.models.task import Task, TaskStatus
from app.models.work_order import WorkOrder
from app.models.opportunity import Opportunity
from app.models.lead import Lead
from app.utils.team_leader_peer_scope import get_peer_team_leader_ids
from app.utils.work_order_pool import team_leader_may_access_pool_work_order


def _team_leader_peer_ids(db: Optional[Session], user_id: int) -> List[int]:
    if db is not None:
        return get_peer_team_leader_ids(db, user_id)
    return [user_id]


def check_role_permission(user_role: UserRole, required_roles: List[UserRole]) -> bool:
    """检查用户角色权限"""
    return user_role in required_roles


def can_view_task(user_role: UserRole, user_id: int, task: Task, user_sales_unit: str = None, db: Session = None) -> bool:
    """
    检查用户是否可以查看任务
    - 总管可以查看所有任务，但不包括草稿状态的任务（草稿状态只有创建者可见）
    - 专项任务发起人只能查看自己发起的任务
    - 销售单位接口人可以查看销售单位匹配的任务
    - 其他角色根据关联关系判断
    """
    if user_role == UserRole.MANAGER:
        # 总管不能查看草稿状态的任务（草稿状态只有创建者可见）
        return task.status != TaskStatus.DRAFT
    
    if user_role == UserRole.TASK_INITIATOR:
        return task.initiator_id == user_id
    
    if user_role == UserRole.SALES_CONTACT:
        # 销售单位接口人可以查看销售单位匹配的任务
        # 如果提供了user_sales_unit，使用包含匹配；否则检查task.sales_contact_id（兼容旧数据）
        if user_sales_unit:
            task_sales_units = [unit.strip() for unit in task.sales_unit.split(',') if unit.strip()]
            # 特殊处理：如果任务的sales_unit包含"全部"，所有销售单位接口人都能看到
            if "全部" in task_sales_units:
                return True
            # 支持精确匹配和包含匹配
            for unit in task_sales_units:
                # 精确匹配
                if user_sales_unit == unit:
                    return True
                # 包含匹配：任务的销售单位包含用户的销售单位，或用户的销售单位包含任务的销售单位
                if user_sales_unit in unit or unit in user_sales_unit:
                    return True
            return False
        # 兼容旧逻辑：如果任务有sales_contact_id，也允许查看
        return task.sales_contact_id == user_id
    
    if user_role == UserRole.TEAM_LEADER:
        peer_ids = _team_leader_peer_ids(db, user_id)
        work_orders = [
            wo
            for wo in task.work_orders
            if (wo.team_leader_id and wo.team_leader_id in peer_ids)
            or team_leader_may_access_pool_work_order(db, user_id, wo)
        ]
        return len(work_orders) > 0
    
    if user_role == UserRole.MEMBER:
        # 成员可以查看分配给自己的工单对应的任务
        work_orders = [wo for wo in task.work_orders if wo.member_id == user_id]
        return len(work_orders) > 0
    
    return False


def can_edit_task(user_role: UserRole, user_id: int, task: Task, user_sales_unit: str = None) -> bool:
    """
    检查用户是否可以编辑任务
    
    注意：实际编辑权限由 update_task API 控制，此函数仅用于前端显示判断
    实际规则：只有创建者可以修改任务
    """
    if user_role == UserRole.MANAGER:
        return True
    
    if user_role == UserRole.TASK_INITIATOR:
        # 发起人可以在草稿、待确认、已拒绝状态下编辑
        # 也可以在已确认、详细需求已提交、已派单状态下编辑（但只能修改销售单位和FDE人数）
        if task.initiator_id != user_id:
            return False
        
        # 草稿状态：可以编辑所有字段
        if task.status == TaskStatus.DRAFT:
            return True
        
        # 待确认、已拒绝状态：可以编辑所有字段
        if task.status in [TaskStatus.PENDING, TaskStatus.REJECTED]:
            return True
        
        # 已确认、详细需求已提交、已派单状态：只能修改销售单位和FDE人数
        if task.status in [TaskStatus.CONFIRMED, TaskStatus.DETAIL_SUBMITTED, TaskStatus.DISPATCHED]:
            return True
        
        return False
    
    # 销售单位接口人不能编辑任务（实际API只允许创建者修改）
    # 保留此逻辑用于兼容性，但实际不会返回True
    if user_role == UserRole.SALES_CONTACT:
        # 只有创建者可以修改任务，销售单位接口人不能编辑
        return False
    
    return False


def can_view_work_order(user_role: UserRole, user_id: int, work_order: WorkOrder, user_sales_unit: str = None, db: Session = None) -> bool:
    """
    检查用户是否可以查看工单
    - 总管可以查看所有工单
    - 专项任务发起人可以查看所属专项（自己发起的任务）的工单
    - 销售单位接口人可以查看销售单位匹配的任务的工单
    - 组长可以查看分配给自己的工单
    - 成员可以查看分配给自己的工单
    """
    if user_role == UserRole.MANAGER:
        return True

    if user_role == UserRole.TEAM_LEADER:
        peer_ids = _team_leader_peer_ids(db, user_id)
        if work_order.team_leader_id and work_order.team_leader_id in peer_ids:
            return True
        return team_leader_may_access_pool_work_order(db, user_id, work_order)

    if user_role == UserRole.MEMBER:
        return work_order.member_id == user_id

    # 专项任务发起人和销售单位接口人：通过工单关联的任务判断
    if work_order.task:
        if user_role == UserRole.TASK_INITIATOR:
            return work_order.task.initiator_id == user_id

        if user_role == UserRole.SALES_CONTACT:
            # 销售单位接口人可以查看销售单位匹配的任务的工单
            if user_sales_unit:
                task_sales_units = [unit.strip() for unit in work_order.task.sales_unit.split(',') if unit.strip()]
                # 特殊处理：如果任务的sales_unit包含"全部"，所有销售单位接口人都能看到
                if "全部" in task_sales_units:
                    return True
                # 支持精确匹配和包含匹配
                for unit in task_sales_units:
                    # 精确匹配
                    if user_sales_unit == unit:
                        return True
                    # 包含匹配：任务的销售单位包含用户的销售单位，或用户的销售单位包含任务的销售单位
                    if user_sales_unit in unit or unit in user_sales_unit:
                        return True
                return False
            # 兼容旧逻辑：如果任务有sales_contact_id，也允许查看
            return work_order.task.sales_contact_id == user_id

    return False


def can_manage_work_order(user_role: UserRole, user_id: int, work_order: WorkOrder, db: Session = None) -> bool:
    """
    检查用户是否可以管理工单
    - 总管可以管理所有工单
    - 组长可以管理分配给自己的工单
    - 成员可以管理分配给自己的工单
    - 专项任务发起人和销售单位接口人只能查看，不能管理
    """
    if user_role == UserRole.MANAGER:
        return True

    if user_role == UserRole.TEAM_LEADER:
        peer_ids = _team_leader_peer_ids(db, user_id)
        if work_order.team_leader_id and work_order.team_leader_id in peer_ids:
            return True
        return team_leader_may_access_pool_work_order(db, user_id, work_order)

    if user_role == UserRole.MEMBER:
        return work_order.member_id == user_id

    # 专项任务发起人和销售单位接口人只能查看，不能管理
    return False


def can_view_lead(
    user_role: UserRole,
    user_id: int,
    lead: Lead,
    user_sales_unit: str = None,
    requirement_sales_contact_id: int = None,
    requirement_sales_unit: str = None,
    db: Session = None,
) -> bool:
    """
    检查用户是否可以查看线索
    - 总管可以查看所有线索
    - 专项任务发起人可以查看其发起任务下的线索
    - 成员只能查看自己创建的线索
    - 组长可以查看自己团队成员的拜访日志对应的线索
    - 销售单位接口人只能查看属于自己销售单位的线索

    参数：
    - requirement_sales_contact_id: 工单关联的需求的sales_contact_id（如果工单有关联需求）
    - requirement_sales_unit: 工单关联的需求的提交人的销售单位（如果工单有关联需求）
    """
    if user_role == UserRole.MANAGER:
        return True

    if user_role == UserRole.TASK_INITIATOR:
        return bool(lead.task and lead.task.initiator_id == user_id)

    if user_role == UserRole.MEMBER:
        return lead.member_id == user_id

    if user_role == UserRole.TEAM_LEADER:
        if lead.visit_log and lead.visit_log.work_order:
            return lead.visit_log.work_order.team_leader_id in _team_leader_peer_ids(db, user_id)
        return False

    if user_role == UserRole.SALES_CONTACT:
        # 销售单位接口人只能查看属于自己销售单位的线索
        # 判断逻辑：通过线索关联的工单的需求来判断
        if not lead.visit_log or not lead.visit_log.work_order:
            return False

        work_order = lead.visit_log.work_order

        # 优先：如果工单有关联的需求，通过需求的sales_contact_id和销售单位匹配
        if requirement_sales_contact_id is not None:
            # 如果需求的sales_contact_id就是当前用户，允许查看
            if requirement_sales_contact_id == user_id:
                return True
            # 如果提供了需求的提交人的销售单位，进行匹配
            if user_sales_unit and requirement_sales_unit:
                if user_sales_unit == requirement_sales_unit:
                    return True
                if user_sales_unit in requirement_sales_unit or requirement_sales_unit in user_sales_unit:
                    return True
            return False

        # 回退：如果工单没有关联需求，通过任务的sales_unit匹配（兼容旧数据）
        if work_order.task and user_sales_unit:
            task_sales_units = [unit.strip() for unit in work_order.task.sales_unit.split(',') if unit.strip()]
            if "全部" in task_sales_units:
                return True
            for unit in task_sales_units:
                if user_sales_unit == unit:
                    return True
                if user_sales_unit in unit or unit in user_sales_unit:
                    return True

        return False

    return False


def can_view_opportunity(user_role: UserRole, user_id: int, opportunity: Opportunity, user_sales_unit: str = None, db: Session = None) -> bool:
    """
    检查用户是否可以查看商机
    - 总管可以查看所有商机
    - 专项任务发起人可以查看其发起任务下的商机
    - 组长可以查看本组（含联席组长）关联的商机
    - 成员可以查看自己创建的商机（通过关联的线索判断）
    - 销售单位接口人只能查看属于自己销售单位的商机
    """
    if user_role == UserRole.MANAGER:
        return True

    if user_role == UserRole.TASK_INITIATOR:
        return bool(opportunity.task and opportunity.task.initiator_id == user_id)

    if user_role == UserRole.TEAM_LEADER:
        peer_ids = _team_leader_peer_ids(db, user_id)
        if opportunity.team_leader_id in peer_ids:
            return True
        if opportunity.lead and opportunity.lead.visit_log and opportunity.lead.visit_log.work_order:
            if opportunity.lead.visit_log.work_order.team_leader_id in peer_ids:
                return True
        return False

    if user_role == UserRole.MEMBER:
        if opportunity.lead and opportunity.lead.member_id == user_id:
            return True
        return False

    if user_role == UserRole.SALES_CONTACT:
        # 销售单位接口人只能查看属于自己销售单位的商机
        # 通过商机关联的线索来判断
        if not opportunity.lead or not opportunity.lead.visit_log or not opportunity.lead.visit_log.work_order:
            return False

        work_order = opportunity.lead.visit_log.work_order

        # 优先：如果工单有关联的需求，通过需求的sales_contact_id和销售单位匹配
        if work_order.detail_requirement_id:
            requirement = work_order.detail_requirement
            if requirement:
                # 如果需求的sales_contact_id就是当前用户，允许查看
                if requirement.sales_contact_id == user_id:
                    return True
                # 如果提供了销售单位，检查需求的提交人的销售单位
                if user_sales_unit and requirement.sales_contact:
                    requirement_sales_unit = requirement.sales_contact.sales_unit
                    if requirement_sales_unit:
                        if user_sales_unit == requirement_sales_unit:
                            return True
                        if user_sales_unit in requirement_sales_unit or requirement_sales_unit in user_sales_unit:
                            return True
            return False

        # 回退：如果工单没有关联需求，通过任务的sales_unit匹配（兼容旧数据）
        if work_order.task and user_sales_unit:
            task_sales_units = [unit.strip() for unit in work_order.task.sales_unit.split(',') if unit.strip()]
            if "全部" in task_sales_units:
                return True
            for unit in task_sales_units:
                if user_sales_unit == unit:
                    return True
                if user_sales_unit in unit or unit in user_sales_unit:
                    return True

        return False

    return False


def can_manage_opportunity(user_role: UserRole, user_id: int, opportunity: Opportunity, user_sales_unit: str = None, db: Session = None) -> bool:
    """
    检查用户是否可以管理商机（编辑、更新状态等）
    - 总管可以管理所有商机
    - 组长可以管理：
      1. team_leader_id == user_id 的商机（自己创建的或成员创建时设置的）
      2. 通过线索关联的工单，工单的team_leader_id == user_id 的商机（团队成员创建的）
    - 成员可以管理自己创建的商机（通过关联的线索判断）
    """
    if user_role == UserRole.MANAGER:
        return True
    
    if user_role == UserRole.TEAM_LEADER:
        peer_ids = _team_leader_peer_ids(db, user_id)
        if opportunity.team_leader_id in peer_ids:
            return True
        if opportunity.lead and opportunity.lead.visit_log and opportunity.lead.visit_log.work_order:
            if opportunity.lead.visit_log.work_order.team_leader_id in peer_ids:
                return True
        return False
    
    if user_role == UserRole.MEMBER:
        # 成员可以管理自己创建的商机（通过关联的线索判断）
        if opportunity.lead and opportunity.lead.member_id == user_id:
            return True
    
    return False

