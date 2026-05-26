"""
操作日志模型
"""
from sqlalchemy import Column, Integer, String, Text, Enum, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from app.database import Base


class AuditAction(str, enum.Enum):
    """操作类型枚举"""
    CREATE = "create"          # 创建
    UPDATE = "update"          # 更新
    DELETE = "delete"          # 删除
    VIEW = "view"              # 查看
    CONFIRM = "confirm"        # 确认
    REJECT = "reject"          # 拒绝
    DISPATCH = "dispatch"      # 派单
    ASSIGN = "assign"          # 分配
    ACCEPT = "accept"          # 接单
    SUBMIT = "submit"          # 提交
    RESET_PASSWORD = "reset_password"  # 重置密码


class AuditResource(str, enum.Enum):
    """操作对象类型枚举"""
    TASK = "task"              # 任务
    WORK_ORDER = "work_order"  # 工单
    OPPORTUNITY = "opportunity"  # 商机
    VISIT_LOG = "visit_log"    # 拜访日志
    DELIVERY_CASE = "delivery_case"  # 转交付
    LEAD = "lead"              # 线索
    REVIEW = "review"          # 复盘
    USER = "user"              # 用户
    GROUP = "group"            # 组
    OPTION_CONFIG = "option_config"  # 选项配置
    UNKNOWN = "unknown"  # 未在枚举中声明的 resource（避免列表接口 500）

class AuditLog(Base):
    """操作日志表"""
    __tablename__ = "audit_logs"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # 操作用户
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, comment="操作用户ID")
    
    # 操作信息
    # 使用 String 类型存储枚举值，避免 MySQL ENUM 类型的大小写敏感问题
    # 枚举值验证在应用层进行（通过 Pydantic schema）
    action = Column(String(50), nullable=False, comment="操作类型")
    resource = Column(String(50), nullable=False, comment="操作对象类型")
    resource_id = Column(Integer, nullable=True, comment="操作对象ID")
    
    # 操作详情
    description = Column(Text, nullable=True, comment="操作描述")
    details = Column(JSON, nullable=True, comment="操作详情（JSON格式）")
    
    # 请求信息
    ip_address = Column(String(50), nullable=True, comment="IP地址")
    user_agent = Column(String(500), nullable=True, comment="用户代理")
    
    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment="操作时间")
    
    # 关系
    user = relationship("User", back_populates="audit_logs")

