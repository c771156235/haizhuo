"""
选项配置管理 API
仅总管权限
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from app.database import get_db
from app.models.option_config import OptionConfig, OptionType
from app.models.user import User, UserRoleAssociation
from app.schemas.option_config import (
    OptionConfigCreate,
    OptionConfigUpdate,
    OptionConfigResponse,
    OptionConfigTree,
    OptionConfigListResponse,
    MemberMenuVisibilityItem,
    MemberMenuVisibilityListResponse,
    MemberMenuVisibilityUpdate,
)
from app.api.deps import require_manager, get_current_user
from app.core.audit import create_audit_log, get_client_ip, get_user_agent
from app.models.audit_log import AuditAction, AuditResource

router = APIRouter(prefix="/option-configs", tags=["选项配置管理"])


MEMBER_MENU_ITEMS = [
    {"menu_key": "/statistics", "label": "数据统计", "sort_order": 1},
    {"menu_key": "/tasks", "label": "任务管理", "sort_order": 2},
    {"menu_key": "/work-orders", "label": "工单管理", "sort_order": 3},
    {"menu_key": "/visit-logs", "label": "线索维护", "sort_order": 4},
    {"menu_key": "/opportunities", "label": "商机管理", "sort_order": 5},
    {"menu_key": "/reviews", "label": "复盘管理", "sort_order": 6},
]


def build_option_tree(
    options: List[OptionConfig],
    parent_id: Optional[int] = None
) -> List[OptionConfigTree]:
    """构建选项树形结构"""
    # 过滤出当前层级的选项
    current_level = [
        opt for opt in options
        if opt.parent_id == parent_id and opt.is_active
    ]
    
    # 按 sort_order 排序
    current_level.sort(key=lambda x: (x.sort_order, x.id))
    
    # 递归构建子树
    result = []
    for opt in current_level:
        children = build_option_tree(options, opt.id)
        # 将字符串类型的 option_type 转换为枚举对象（用于序列化）
        # 注意：数据库存储的是字符串，但schema期望枚举类型
        option_type_enum = OptionType(opt.option_type) if isinstance(opt.option_type, str) else opt.option_type
        
        tree_node = OptionConfigTree(
            id=opt.id,
            option_type=option_type_enum,
            value=opt.value,
            label=opt.label,
            parent_id=opt.parent_id,
            level=opt.level,
            sort_order=opt.sort_order,
            is_active=opt.is_active,
            description=opt.description,
            created_at=opt.created_at,
            updated_at=opt.updated_at,
            children=children if children else None
        )
        result.append(tree_node)
    
    return result


def calculate_level(db: Session, parent_id: Optional[int]) -> int:
    """计算选项的层级"""
    MAX_LEVEL = 4  # 最大支持4级
    if parent_id is None:
        return 1
    parent = db.query(OptionConfig).filter(OptionConfig.id == parent_id).first()
    if parent is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="父选项不存在"
        )
    new_level = parent.level + 1
    if new_level > MAX_LEVEL:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"选项层级不能超过{MAX_LEVEL}级"
        )
    return new_level


@router.get("/member-menu-visibility", response_model=MemberMenuVisibilityListResponse)
def get_member_menu_visibility(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取成员侧栏菜单可见性（登录用户可访问）"""
    menu_keys = [item["menu_key"] for item in MEMBER_MENU_ITEMS]
    db_items = db.query(OptionConfig).filter(
        and_(
            OptionConfig.option_type == OptionType.MEMBER_MENU_VISIBILITY.value,
            OptionConfig.value.in_(menu_keys),
        )
    ).all()
    visibility_map = {item.value: item.is_active for item in db_items}
    items = [
        MemberMenuVisibilityItem(
            menu_key=item["menu_key"],
            label=item["label"],
            is_visible=visibility_map.get(item["menu_key"], True),
        )
        for item in MEMBER_MENU_ITEMS
    ]
    return MemberMenuVisibilityListResponse(items=items)


@router.put("/member-menu-visibility", response_model=MemberMenuVisibilityItem)
def update_member_menu_visibility(
    payload: MemberMenuVisibilityUpdate,
    request: Request,
    db: Session = Depends(get_db),
    user_role: tuple[User, UserRoleAssociation] = Depends(require_manager),
):
    """更新成员侧栏菜单可见性（仅总管可访问）"""
    user, _ = user_role
    menu_key = payload.menu_key
    menu_meta = next((item for item in MEMBER_MENU_ITEMS if item["menu_key"] == menu_key), None)
    if not menu_meta:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="菜单项不存在",
        )

    db_option = db.query(OptionConfig).filter(
        and_(
            OptionConfig.option_type == OptionType.MEMBER_MENU_VISIBILITY.value,
            OptionConfig.value == menu_key,
            OptionConfig.parent_id.is_(None),
        )
    ).first()

    if not db_option:
        db_option = OptionConfig(
            option_type=OptionType.MEMBER_MENU_VISIBILITY.value,
            value=menu_key,
            label=menu_meta["label"],
            parent_id=None,
            level=1,
            sort_order=menu_meta["sort_order"],
            is_active=payload.is_visible,
            description="成员侧栏菜单可见性配置",
        )
        db.add(db_option)
    else:
        db_option.is_active = payload.is_visible
        db_option.label = menu_meta["label"]
        db_option.sort_order = menu_meta["sort_order"]
    db.commit()
    db.refresh(db_option)

    ip_address = get_client_ip(request) if request else None
    user_agent = get_user_agent(request) if request else None
    create_audit_log(
        db=db,
        user_id=user.id,
        action=AuditAction.UPDATE,
        resource=AuditResource.OPTION_CONFIG,
        resource_id=db_option.id,
        description=f"更新成员菜单可见性: {menu_meta['label']} -> {'显示' if payload.is_visible else '隐藏'}",
        ip_address=ip_address,
        user_agent=user_agent,
    )

    return MemberMenuVisibilityItem(
        menu_key=menu_key,
        label=menu_meta["label"],
        is_visible=payload.is_visible,
    )


@router.get("/{option_type}", response_model=OptionConfigListResponse)
def get_option_configs(
    option_type: OptionType,
    db: Session = Depends(get_db)
):
    """获取选项配置列表（树形结构）- 公开接口，所有用户可访问"""
    # 获取所有启用状态的选项
    # 注意：option_type 现在存储为字符串，需要使用枚举的值进行比较
    options = db.query(OptionConfig).filter(
        and_(
            OptionConfig.option_type == option_type.value,
            OptionConfig.is_active == True
        )
    ).all()
    
    # 构建树形结构
    tree = build_option_tree(options)
    
    return OptionConfigListResponse(items=tree)


def build_option_tree_admin(
    options: List[OptionConfig],
    parent_id: Optional[int] = None
) -> List[OptionConfigTree]:
    """构建选项树形结构（管理接口，包含禁用项）"""
    # 过滤出当前层级的选项
    # 注意：当 parent_id 为 None 时，需要匹配数据库中的 NULL 值
    # 在 Python 中，None == None 是 True，所以这应该能正确工作
    current_level = [opt for opt in options if opt.parent_id == parent_id]
    
    # 按 sort_order 排序
    current_level.sort(key=lambda x: (x.sort_order, x.id))
    
    # 递归构建子树
    result = []
    for opt in current_level:
        children = build_option_tree_admin(options, opt.id)
        # 将字符串类型的 option_type 转换为枚举对象（用于序列化）
        # 注意：数据库存储的是字符串，但schema期望枚举类型
        option_type_enum = OptionType(opt.option_type) if isinstance(opt.option_type, str) else opt.option_type
        
        tree_node = OptionConfigTree(
            id=opt.id,
            option_type=option_type_enum,
            value=opt.value,
            label=opt.label,
            parent_id=opt.parent_id,
            level=opt.level,
            sort_order=opt.sort_order,
            is_active=opt.is_active,
            description=opt.description,
            created_at=opt.created_at,
            updated_at=opt.updated_at,
            children=children if children else None
        )
        result.append(tree_node)
    
    return result


@router.get("/admin/{option_type}", response_model=OptionConfigListResponse)
def get_option_configs_admin(
    option_type: OptionType,
    db: Session = Depends(get_db),
    user_role: tuple[User, UserRoleAssociation] = Depends(require_manager)
):
    """获取选项配置列表（树形结构，包含禁用项）- 仅总管可访问"""
    user, current_role = user_role
    
    # 获取所有选项（包括禁用的）
    # 注意：option_type 现在存储为字符串，需要使用枚举的值进行比较
    options = db.query(OptionConfig).filter(
        OptionConfig.option_type == option_type.value
    ).all()
    
    # 调试日志
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"查询选项配置: option_type={option_type.value}, 找到 {len(options)} 条记录")
    
    # 构建树形结构（不过滤 is_active，因为这是管理接口）
    tree = build_option_tree_admin(options)
    
    logger.info(f"构建树形结构完成: 根节点数={len(tree)}")
    
    return OptionConfigListResponse(items=tree)




@router.post("", response_model=OptionConfigResponse, status_code=status.HTTP_201_CREATED)
def create_option_config(
    option_config: OptionConfigCreate,
    request: Request,
    db: Session = Depends(get_db),
    user_role: tuple[User, UserRoleAssociation] = Depends(require_manager)
):
    """创建选项配置 - 仅总管可访问"""
    user, current_role = user_role
    
    # 检查 value 是否已存在（同一类型和父级下）
    # 注意：option_type 现在存储为字符串，需要使用枚举的值进行比较
    existing = db.query(OptionConfig).filter(
        and_(
            OptionConfig.option_type == option_config.option_type.value,
            OptionConfig.value == option_config.value,
            OptionConfig.parent_id == option_config.parent_id
        )
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"选项值 '{option_config.value}' 已存在"
        )
    
    # 计算层级
    level = calculate_level(db, option_config.parent_id)
    
    # 创建选项
    # 注意：option_type 现在存储为字符串，需要转换为枚举的值
    db_option = OptionConfig(
        option_type=option_config.option_type.value,
        value=option_config.value,
        label=option_config.label,
        parent_id=option_config.parent_id,
        level=level,
        sort_order=option_config.sort_order,
        is_active=option_config.is_active,
        description=option_config.description
    )
    
    db.add(db_option)
    db.commit()
    db.refresh(db_option)
    
    # 记录审计日志
    ip_address = get_client_ip(request) if request else None
    user_agent = get_user_agent(request) if request else None
    create_audit_log(
        db=db,
        user_id=user.id,
        action=AuditAction.CREATE,
        resource=AuditResource.OPTION_CONFIG,
        resource_id=db_option.id,
        description=f"创建选项配置: {option_config.option_type.value} - {option_config.label}",
        ip_address=ip_address,
        user_agent=user_agent
    )
    
    return db_option


@router.put("/{option_id}", response_model=OptionConfigResponse)
def update_option_config(
    option_id: int,
    option_config: OptionConfigUpdate,
    request: Request,
    db: Session = Depends(get_db),
    user_role: tuple[User, UserRoleAssociation] = Depends(require_manager)
):
    """更新选项配置 - 仅总管可访问"""
    user, current_role = user_role
    
    # 查找选项
    db_option = db.query(OptionConfig).filter(OptionConfig.id == option_id).first()
    if not db_option:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="选项配置不存在"
        )
    
    # 如果更新了 parent_id，检查是否会造成循环引用
    if option_config.parent_id is not None and option_config.parent_id != db_option.parent_id:
        # 检查新父级不能是当前选项的子节点
        def check_circular(new_parent_id: int, current_id: int) -> bool:
            if new_parent_id == current_id:
                return True
            parent = db.query(OptionConfig).filter(OptionConfig.id == new_parent_id).first()
            if parent and parent.parent_id:
                return check_circular(parent.parent_id, current_id)
            return False
        
        if check_circular(option_config.parent_id, option_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="不能将选项设置为自己的子选项"
            )
        
        # 重新计算层级
        new_level = calculate_level(db, option_config.parent_id)
        db_option.level = new_level
    
    # 如果更新了 value，检查是否冲突
    # 注意：option_type 现在存储为字符串，直接比较即可
    if option_config.value is not None and option_config.value != db_option.value:
        existing = db.query(OptionConfig).filter(
            and_(
                OptionConfig.option_type == db_option.option_type,  # 已经是字符串，直接比较
                OptionConfig.value == option_config.value,
                OptionConfig.parent_id == (option_config.parent_id if option_config.parent_id is not None else db_option.parent_id),
                OptionConfig.id != option_id
            )
        ).first()
        
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"选项值 '{option_config.value}' 已存在"
            )
    
    # 更新字段
    update_data = option_config.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if value is not None:
            setattr(db_option, field, value)
    
    db.commit()
    db.refresh(db_option)
    
    # 记录审计日志
    # 注意：db_option.option_type 是字符串类型，不是枚举，直接使用即可
    ip_address = get_client_ip(request) if request else None
    user_agent = get_user_agent(request) if request else None
    create_audit_log(
        db=db,
        user_id=user.id,
        action=AuditAction.UPDATE,
        resource=AuditResource.OPTION_CONFIG,
        resource_id=db_option.id,
        description=f"更新选项配置: {db_option.option_type} - {db_option.label}",
        ip_address=ip_address,
        user_agent=user_agent
    )
    
    return db_option


@router.delete("/{option_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_option_config(
    option_id: int,
    request: Request,
    db: Session = Depends(get_db),
    user_role: tuple[User, UserRoleAssociation] = Depends(require_manager)
):
    """删除选项配置 - 仅总管可访问"""
    user, current_role = user_role
    
    # 查找选项
    db_option = db.query(OptionConfig).filter(OptionConfig.id == option_id).first()
    if not db_option:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="选项配置不存在"
        )
    
    # 检查是否有子选项
    children = db.query(OptionConfig).filter(OptionConfig.parent_id == option_id).first()
    if children:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该选项下存在子选项，请先删除所有子选项"
        )
    
    # 检查是否被使用（可选：这里可以根据实际情况决定是否允许删除已使用的选项）
    # 为了安全，我们采用软删除：将 is_active 设置为 False 而不是真正删除
    # 如果确实需要硬删除，可以取消下面的注释
    
    # 记录审计日志
    # 注意：db_option.option_type 是字符串类型，不是枚举，直接使用即可
    ip_address = get_client_ip(request) if request else None
    user_agent = get_user_agent(request) if request else None
    create_audit_log(
        db=db,
        user_id=user.id,
        action=AuditAction.DELETE,
        resource=AuditResource.OPTION_CONFIG,
        resource_id=db_option.id,
        description=f"删除选项配置: {db_option.option_type} - {db_option.label}",
        ip_address=ip_address,
        user_agent=user_agent
    )
    
    # 软删除：禁用选项
    db_option.is_active = False
    db.commit()
    
    # 如果需要硬删除，使用下面的代码：
    # db.delete(db_option)
    # db.commit()

