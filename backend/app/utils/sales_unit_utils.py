"""
销售单位字符串解析（与前端 TaskDetail / Profile 中 parseSalesUnit 一级部门逻辑对齐）
"""
from __future__ import annotations

# 与 frontend/src/pages/TaskDetail.tsx departments 对象的一级 key 保持一致
_TOP_LEVEL_DEPARTMENT_KEYS = frozenset(
    {
        "云能力中心",
        "海卓",
        "阿网",
        "恒联",
        "政企群",
        "商客部",
        "销售单位",
    }
)


def parse_sales_unit_top_level(sales_unit: str | None) -> str | None:
    """
    返回销售单位字符串对应的一级部门；无法识别时返回 None。
    """
    if not sales_unit or not str(sales_unit).strip():
        return None
    s = str(sales_unit).strip()
    if " - " in s:
        parts = s.split(" - ")
        if len(parts) == 2:
            return parts[0] or None
    if s in _TOP_LEVEL_DEPARTMENT_KEYS:
        return s
    return None


def sales_contact_can_choose_customer_source(sales_unit: str | None) -> bool:
    """仅云能力中心销售单位接口人可自行选择客户来源。"""
    return parse_sales_unit_top_level(sales_unit) == "云能力中心"
