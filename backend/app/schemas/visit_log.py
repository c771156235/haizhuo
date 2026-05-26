"""
拜访日志相关的 Pydantic 模式
"""
import json
from pydantic import BaseModel, Field, model_validator, validator
from typing import Optional, Any
from datetime import datetime, date

# 拜访日志 — 企业类型（与前端下拉一致）
VISIT_LOG_ENTERPRISE_TYPES = (
    "大型企业",
    "小微企业",
    "中型企业",
    "事业单位",
    "政府单位",
)

# 拜访对象权限（与前端下拉一致）
VISIT_LOG_DECISION_AUTHORITY_OPTIONS = ("建议权", "决策权", "无")
# 当前阶段（与前端下拉一致）
VISIT_LOG_CURRENT_STAGE_OPTIONS = ("需求排摸", "标品试用", "POC测试", "转商交付", "流失")

# 各当前阶段下「人员投入 / 投入时长」按子环节拆分的顺序（与前端 VISIT_LOG_STAGE_EFFORT_SUB_PHASES 一致）
STAGE_EFFORT_SUB_PHASES: dict[str, tuple[str, ...]] = {
    "POC测试": ("需求排摸", "标品试用", "POC测试"),
    "标品试用": ("需求排摸", "标品试用"),
    "流失": ("需求排摸", "方案报价"),
    "需求排摸": ("需求排摸",),
    "转商交付": ("需求排摸", "标品试用", "POC测试", "转商交付"),
}


def normalize_stage_effort_breakdown_json(
    current_stage: Optional[str], raw: Optional[str]
) -> Optional[str]:
    """校验并规范化为按子环节顺序的 JSON 数组字符串；空则返回 None。"""
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        return None
    if not current_stage or current_stage not in STAGE_EFFORT_SUB_PHASES:
        raise ValueError("填写阶段人员与时长明细时，请先选择有效的当前阶段")
    allowed = STAGE_EFFORT_SUB_PHASES[current_stage]
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError("阶段人员与时长须为合法 JSON") from e
    if not isinstance(data, list):
        raise ValueError("阶段人员与时长须为 JSON 数组")
    by_sub: dict[str, dict[str, Any]] = {}
    for item in data:
        if not isinstance(item, dict):
            continue
        sp = item.get("sub_phase")
        if not isinstance(sp, str) or sp not in allowed:
            raise ValueError(f"无效的子环节：{sp!r}")
        if sp in by_sub:
            raise ValueError(f"子环节重复：{sp}")
        by_sub[sp] = item
    out: list[dict[str, Any]] = []
    for sp in allowed:
        item = by_sub.get(sp, {})
        people = item.get("people")
        days = item.get("days")
        p_out: Optional[float] = None
        d_out: Optional[float] = None
        if people is not None and people != "":
            try:
                p_out = float(people)
                if p_out < 0:
                    raise ValueError
            except (TypeError, ValueError):
                raise ValueError(f"子环节「{sp}」的人员投入须为非负数字") from None
        if days is not None and days != "":
            try:
                d_out = float(days)
                if d_out < 0:
                    raise ValueError
            except (TypeError, ValueError):
                raise ValueError(f"子环节「{sp}」的投入时长须为非负数字") from None
        out.append({"sub_phase": sp, "people": p_out, "days": d_out})
    return json.dumps(out, ensure_ascii=False)


def visit_log_counts_as_has_authority(value) -> bool:
    """统计用：具备建议权或决策权；旧布尔 True 视为具备。"""
    if value is True:
        return True
    if isinstance(value, str) and value in ("建议权", "决策权"):
        return True
    return False


def visit_log_counts_as_has_clue(value) -> bool:
    """统计用：拜访日志「是否有线索」计一条线索；与导出「是/否」口径一致。

    兼容 MySQL BOOLEAN（TINYINT）经驱动返回的 1/0：不能用 ``value is True``，否则界面显示「是」时统计仍为 0。
    """
    if value is True:
        return True
    if value is False or value is None:
        return False
    if isinstance(value, int):
        return value != 0
    if isinstance(value, str):
        return value.strip() in ("1", "true", "True", "yes", "是")
    return False


def format_visit_log_decision_authority_display(value) -> str:
    """导出/展示：空为空白；旧布尔映射为决策权/无。"""
    if value is None or value == "":
        return ""
    if value is True:
        return "决策权"
    if value is False:
        return "无"
    return str(value)


def format_stage_effort_breakdown_display(raw: Optional[str]) -> str:
    """导出/详情：将阶段人员与时长 JSON 转为可读文本。"""
    if raw is None or not str(raw).strip():
        return ""
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return str(raw)
    if not isinstance(data, list):
        return str(raw)
    parts: list[str] = []
    for item in data:
        if not isinstance(item, dict):
            continue
        sp = item.get("sub_phase")
        if not isinstance(sp, str):
            continue
        pe, da = item.get("people"), item.get("days")
        if pe is None and da is None:
            continue
        p_s = "" if pe is None else str(pe)
        d_s = "" if da is None else str(da)
        parts.append(f"{sp}：人员{p_s}人，时长{d_s}天")
    return "；".join(parts)


class VisitLogBase(BaseModel):
    """拜访日志基础模式"""
    work_order_id: int
    visit_date: date
    visit_content: str
    remark: Optional[str] = None
    visit_object_position: Optional[str] = None
    has_decision_authority: Optional[str] = None
    has_clue: bool = False
    clue_related_products: Optional[str] = None
    current_stage: Optional[str] = None
    stage_effort_breakdown: Optional[str] = None  # JSON：[{sub_phase, people, days}]
    promotion_progress: Optional[str] = None
    promotion_requirements: Optional[str] = None
    is_customized_development: bool = False
    customized_development_requirements: Optional[str] = None
    project_amount: Optional[str] = None
    has_requirement_scenario_sorted: bool = False
    requirement_scenario_category: Optional[str] = None
    opportunity_no: Optional[str] = None
    industry: Optional[str] = None
    enterprise_type: Optional[str] = None
    escort_staff: Optional[str] = None


class VisitLogCreate(VisitLogBase):
    """创建拜访日志模式"""
    industry: str = Field(..., min_length=1, description="行业")
    enterprise_type: str = Field(..., description="企业类型")

    @validator("enterprise_type")
    def validate_enterprise_type(cls, v: str) -> str:
        if v not in VISIT_LOG_ENTERPRISE_TYPES:
            raise ValueError(
                f"企业类型必须是以下之一：{', '.join(VISIT_LOG_ENTERPRISE_TYPES)}"
            )
        return v

    @validator("has_decision_authority")
    def validate_has_decision_authority(cls, v):
        if v is None:
            return v
        if v not in VISIT_LOG_DECISION_AUTHORITY_OPTIONS:
            raise ValueError(
                f"拜访对象权限必须是以下之一：{', '.join(VISIT_LOG_DECISION_AUTHORITY_OPTIONS)}"
            )
        return v

    @validator("current_stage")
    def validate_current_stage(cls, v):
        if v is None:
            return v
        if v not in VISIT_LOG_CURRENT_STAGE_OPTIONS:
            raise ValueError(
                f"当前阶段必须是以下之一：{', '.join(VISIT_LOG_CURRENT_STAGE_OPTIONS)}"
            )
        return v

    @model_validator(mode="after")
    def normalize_stage_effort_create(self):
        try:
            normalized = normalize_stage_effort_breakdown_json(
                self.current_stage, self.stage_effort_breakdown
            )
        except ValueError:
            raise
        self.stage_effort_breakdown = normalized
        return self

    @model_validator(mode="after")
    def validate_customized_development_requirements(self):
        if self.customized_development_requirements is not None:
            t = self.customized_development_requirements.strip()
            self.customized_development_requirements = t if t else None
        if self.is_customized_development:
            s = self.customized_development_requirements or ""
            if not s:
                raise ValueError("选择定开后请填写定开要求")
        return self


class VisitLogUpdate(BaseModel):
    """更新拜访日志模式"""
    visit_date: Optional[date] = None
    visit_content: Optional[str] = None
    remark: Optional[str] = None
    visit_object_position: Optional[str] = None
    has_decision_authority: Optional[str] = None
    has_clue: Optional[bool] = None
    clue_related_products: Optional[str] = None
    current_stage: Optional[str] = None
    stage_effort_breakdown: Optional[str] = None
    promotion_progress: Optional[str] = None
    promotion_requirements: Optional[str] = None
    is_customized_development: Optional[bool] = None
    customized_development_requirements: Optional[str] = None
    project_amount: Optional[str] = None
    has_requirement_scenario_sorted: Optional[bool] = None
    requirement_scenario_category: Optional[str] = None
    opportunity_no: Optional[str] = None
    industry: Optional[str] = None
    enterprise_type: Optional[str] = None
    escort_staff: Optional[str] = None

    @validator("enterprise_type")
    def validate_enterprise_type_update(cls, v):
        if v is None:
            return v
        if v not in VISIT_LOG_ENTERPRISE_TYPES:
            raise ValueError(
                f"企业类型必须是以下之一：{', '.join(VISIT_LOG_ENTERPRISE_TYPES)}"
            )
        return v

    @validator("has_decision_authority")
    def validate_has_decision_authority_update(cls, v):
        if v is None:
            return v
        if v not in VISIT_LOG_DECISION_AUTHORITY_OPTIONS:
            raise ValueError(
                f"拜访对象权限必须是以下之一：{', '.join(VISIT_LOG_DECISION_AUTHORITY_OPTIONS)}"
            )
        return v

    @validator("current_stage")
    def validate_current_stage_update(cls, v):
        if v is None:
            return v
        if v not in VISIT_LOG_CURRENT_STAGE_OPTIONS:
            raise ValueError(
                f"当前阶段必须是以下之一：{', '.join(VISIT_LOG_CURRENT_STAGE_OPTIONS)}"
            )
        return v


class VisitLogMaintenanceUpdate(BaseModel):
    """线索维护窄域更新：线索对应产品、预估金额、当前阶段、阶段人员与时长、推进进展（追加）、推进要求"""

    clue_related_products: Optional[str] = None
    project_amount: Optional[str] = None
    current_stage: Optional[str] = None
    stage_effort_breakdown: Optional[str] = None
    promotion_requirements: Optional[str] = None
    promotion_progress_append: Optional[str] = None

    @validator("current_stage")
    def validate_current_stage_maintenance(cls, v):
        if v is None:
            return v
        if v not in VISIT_LOG_CURRENT_STAGE_OPTIONS:
            raise ValueError(
                f"当前阶段必须是以下之一：{', '.join(VISIT_LOG_CURRENT_STAGE_OPTIONS)}"
            )
        return v

    @validator("project_amount")
    def normalize_project_amount(cls, v):
        if v is None:
            return v
        t = str(v).strip()
        return t if t else None


class VisitLogInDB(VisitLogBase):
    """数据库中的拜访日志模式"""
    id: int
    member_id: int
    sales_unit: Optional[str] = None  # 创建时落库：工单所属任务的面向销售单位
    group_name: Optional[str] = None  # 创建时落库的组长所属组名
    customer_unit: Optional[str] = None  # 创建时落库的客户单位快照
    customer_visit_address: Optional[str] = None
    customer_manager_name: Optional[str] = None
    customer_manager_contact: Optional[str] = None
    promotion_progress_history: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class VisitLogResponse(VisitLogInDB):
    """拜访日志响应模式（包含关联信息）"""
    # 基于 option_configs（product）将 clue_related_products 转为可读标签，与导出 Excel 口径一致
    clue_related_products_display: Optional[str] = None

    # 工单信息
    work_order_no: Optional[str] = None
    work_order_task_id: Optional[int] = None
    work_order_task_name: Optional[str] = None
    work_order_task_sales_unit: Optional[str] = None
    work_order_customer_unit: Optional[str] = None  # 客户单位
    
    # 成员信息
    member_name: Optional[str] = None
    member_username: Optional[str] = None
    
    @classmethod
    def from_orm_with_relations(cls, visit_log, db=None):
        """从ORM对象创建响应，包含关联信息"""
        from app.utils.product_utils import convert_product_value_to_label

        data = {
            "id": visit_log.id,
            "work_order_id": visit_log.work_order_id,
            "member_id": visit_log.member_id,
            "visit_date": visit_log.visit_date,
            "visit_content": visit_log.visit_content,
            "remark": getattr(visit_log, "remark", None),
            "visit_object_position": visit_log.visit_object_position,
            "has_decision_authority": visit_log.has_decision_authority,
            "has_clue": getattr(visit_log, "has_clue", False),
            "clue_related_products": getattr(visit_log, "clue_related_products", None),
            "current_stage": getattr(visit_log, "current_stage", None),
            "stage_effort_breakdown": getattr(
                visit_log, "stage_effort_breakdown", None
            ),
            "promotion_progress": getattr(visit_log, "promotion_progress", None),
            "promotion_progress_history": getattr(
                visit_log, "promotion_progress_history", None
            ),
            "promotion_requirements": getattr(visit_log, "promotion_requirements", None),
            "is_customized_development": getattr(
                visit_log, "is_customized_development", False
            ),
            "customized_development_requirements": getattr(
                visit_log, "customized_development_requirements", None
            ),
            "project_amount": getattr(visit_log, "project_amount", None),
            "has_requirement_scenario_sorted": getattr(
                visit_log, "has_requirement_scenario_sorted", False
            ),
            "requirement_scenario_category": getattr(
                visit_log, "requirement_scenario_category", None
            ),
            "opportunity_no": visit_log.opportunity_no,
            "sales_unit": getattr(visit_log, "sales_unit", None),
            "group_name": getattr(visit_log, "group_name", None),
            "customer_unit": getattr(visit_log, "customer_unit", None),
            "industry": getattr(visit_log, "industry", None),
            "enterprise_type": getattr(visit_log, "enterprise_type", None),
            "customer_visit_address": getattr(visit_log, "customer_visit_address", None),
            "customer_manager_name": getattr(visit_log, "customer_manager_name", None),
            "customer_manager_contact": getattr(visit_log, "customer_manager_contact", None),
            "escort_staff": getattr(visit_log, "escort_staff", None),
            "created_at": visit_log.created_at,
            "updated_at": visit_log.updated_at,
        }
        
        # 填充工单信息
        if visit_log.work_order:
            data["work_order_no"] = visit_log.work_order.work_order_no
            if visit_log.work_order.task:
                data["work_order_task_id"] = visit_log.work_order.task.id
                data["work_order_task_name"] = visit_log.work_order.task.task_name
            snap_su = data.get("sales_unit")
            live_cs = None
            dr = visit_log.work_order.detail_requirement
            if dr and dr.customer_source:
                _c = dr.customer_source
                if isinstance(_c, str):
                    live_cs = _c.strip() or None
                elif _c is not None:
                    live_cs = str(_c).strip() or None
            live_task_su = (
                visit_log.work_order.task.sales_unit
                if visit_log.work_order.task
                else None
            )
            if snap_su:
                data["work_order_task_sales_unit"] = snap_su
            elif live_cs:
                data["work_order_task_sales_unit"] = live_cs
            elif live_task_su is not None:
                data["work_order_task_sales_unit"] = live_task_su
            else:
                data["work_order_task_sales_unit"] = None
            # 客户单位：优先落库快照，旧数据再从工单解析
            if data.get("customer_unit"):
                data["work_order_customer_unit"] = data["customer_unit"]
            elif visit_log.work_order.detail_requirement:
                data["work_order_customer_unit"] = visit_log.work_order.detail_requirement.customer_unit
            elif visit_log.work_order.task and visit_log.work_order.task.customer_unit:
                data["work_order_customer_unit"] = visit_log.work_order.task.customer_unit
        elif data.get("customer_unit"):
            data["work_order_customer_unit"] = data["customer_unit"]

        # 拜访地址与客户经理：旧数据无快照时从当前工单详细需求回填展示
        if visit_log.work_order and visit_log.work_order.detail_requirement:
            dr = visit_log.work_order.detail_requirement
            if not data.get("customer_visit_address"):
                data["customer_visit_address"] = dr.customer_visit_address
            if not data.get("customer_manager_name"):
                data["customer_manager_name"] = dr.customer_manager_name
            if not data.get("customer_manager_contact"):
                data["customer_manager_contact"] = dr.customer_manager_contact
        
        # 填充成员信息
        if visit_log.member:
            data["member_name"] = visit_log.member.real_name
            data["member_username"] = visit_log.member.username

        crp = data.get("clue_related_products")
        if crp:
            data["clue_related_products_display"] = convert_product_value_to_label(crp, db)
        else:
            data["clue_related_products_display"] = None

        return cls(**data)

