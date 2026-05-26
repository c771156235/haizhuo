"""
选项配置模型
用于存储客户需求方向和具体产品选项
"""
from sqlalchemy import Column, Integer, String, Enum, ForeignKey, DateTime, Boolean, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.database import Base


class OptionType(str, enum.Enum):
    """选项类型枚举"""
    REQUIREMENT_DIRECTION = "requirement_direction"  # 客户需求方向
    PRODUCT = "product"  # 具体产品
    MEMBER_MENU_VISIBILITY = "member_menu_visibility"  # 成员侧栏菜单可见性


class OptionConfig(Base):
    """选项配置表"""
    __tablename__ = "option_configs"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # 选项类型
    # 使用 String 类型存储枚举值，避免 MySQL ENUM 类型的大小写敏感问题
    # 枚举值验证在应用层进行（通过 Pydantic schema）
    option_type = Column(String(50), nullable=False, index=True, comment="选项类型：requirement_direction 或 product")
    
    # 选项信息
    value = Column(String(200), nullable=False, comment="选项值（用于存储和匹配）")
    label = Column(String(200), nullable=False, comment="选项标签（用于显示）")
    
    # 层级关系
    parent_id = Column(Integer, ForeignKey("option_configs.id"), nullable=True, index=True, comment="父选项ID（用于构建树形结构）")
    level = Column(Integer, nullable=False, default=1, comment="层级（1为顶级，2为二级，以此类推）")
    
    # 排序
    sort_order = Column(Integer, nullable=False, default=0, comment="排序顺序（数字越小越靠前）")
    
    # 是否启用
    is_active = Column(Boolean, default=True, nullable=False, comment="是否启用")
    
    # 额外信息
    description = Column(Text, nullable=True, comment="选项描述")
    
    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment="创建时间")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), comment="更新时间")
    
    # 关系
    parent = relationship("OptionConfig", remote_side=[id], backref="children")
    
    def __repr__(self):
        return f"<OptionConfig(id={self.id}, type={self.option_type}, value={self.value}, label={self.label}, level={self.level})>"

