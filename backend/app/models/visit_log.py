"""
拜访日志模型
"""
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, Date
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class VisitLog(Base):
    """拜访日志表"""
    __tablename__ = "visit_logs"
    
    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    
    # 关联工单
    work_order_id = Column(Integer, ForeignKey("work_orders.id"), nullable=False, comment="工单ID")
    
    # 关联成员
    member_id = Column(Integer, ForeignKey("users.id"), nullable=False, comment="成员ID")
    
    # 拜访信息
    visit_date = Column(Date, nullable=False, comment="拜访日期")
    visit_content = Column(Text, nullable=False, comment="拜访内容")
    remark = Column(Text, nullable=True, comment="备注")
    
    # 拜访对象信息
    visit_object_position = Column(String(100), nullable=True, comment="拜访对象职位")
    has_decision_authority = Column(
        String(20),
        nullable=True,
        comment="拜访对象权限：建议权、决策权、无",
    )
    
    # 客户需求相关
    has_clue = Column(Boolean, default=False, comment="是否有线索")
    clue_related_products = Column(
        Text, nullable=True, comment="线索对应产品（JSON数组格式，支持多选）"
    )
    current_stage = Column(String(50), nullable=True, comment="当前阶段")
    stage_effort_breakdown = Column(
        Text,
        nullable=True,
        comment="阶段人员与时长(JSON数组：[{sub_phase,people,days}])",
    )
    promotion_progress = Column(Text, nullable=True, comment="推进进展（拼接展示，兼容导出）")
    promotion_progress_history = Column(
        Text,
        nullable=True,
        comment="推进进展追加历史 JSON：[{at,user_id,user_name,text},...]",
    )
    promotion_requirements = Column(Text, nullable=True, comment="推进要求")
    is_customized_development = Column(Boolean, default=False, comment="是否定开")
    customized_development_requirements = Column(
        Text, nullable=True, comment="定开要求（是否定开为是时填写）"
    )
    project_amount = Column(String(50), nullable=True, comment="预估金额（万元）")
    has_requirement_scenario_sorted = Column(
        Boolean, default=False, comment="客户是否梳理过需求场景"
    )
    requirement_scenario_category = Column(
        Text, nullable=True, comment="需求场景分类（JSON数组格式，支持多选）"
    )
    opportunity_no = Column(String(50), nullable=True, index=True, comment="商机编号（已废弃，保留用于兼容）")
    
    # 创建时快照：与工单客户来源一致（详细需求 customer_source）；无详细需求时可为任务 sales_unit（兼容）
    sales_unit = Column(
        Text,
        nullable=True,
        comment="所属销售单位快照（工单详细需求客户来源/兼容任务sales_unit）",
    )
    # 创建时快照：工单组长所属 FDE 组名（与工单当时 group_name 一致）
    group_name = Column(String(100), nullable=True, comment="组别（组长所属组名）")
    # 创建时快照：客户单位（与工单展示逻辑一致：详细需求优先，否则任务级）
    customer_unit = Column(String(500), nullable=True, comment="客户单位快照")
    # 创建时快照：来自工单详细需求（与任务后续修改脱钩）
    customer_visit_address = Column(String(500), nullable=True, comment="客户拜访地址快照")
    customer_manager_name = Column(String(100), nullable=True, comment="客户经理姓名快照")
    customer_manager_contact = Column(String(100), nullable=True, comment="客户经理联系方式快照")
    
    # 拜访时手动填写（与任务/工单无关联）
    industry = Column(String(200), nullable=True, comment="行业")
    enterprise_type = Column(
        String(50),
        nullable=True,
        comment="企业类型：大型企业/小微企业/中型企业/事业单位/政府单位",
    )
    escort_staff = Column(String(200), nullable=True, comment="陪跑人员（手动填写）")
    
    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment="创建时间")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), comment="更新时间")
    
    # 关系
    work_order = relationship("WorkOrder", back_populates="visit_logs")
    member = relationship("User", back_populates="visit_logs")
    review = relationship("Review", back_populates="visit_log", uselist=False, cascade="all, delete-orphan")
    leads = relationship("Lead", back_populates="visit_log", cascade="all, delete-orphan")
    maintenance_logs = relationship(
        "VisitLogMaintenanceLog",
        back_populates="visit_log",
        cascade="all, delete-orphan",
    )

