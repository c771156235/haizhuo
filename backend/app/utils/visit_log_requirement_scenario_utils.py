"""
拜访日志「需求场景分类」：固定枚举；存库为 JSON 字符串数组（单选时 0/1 个元素）。
兼容旧数据（原 requirement_direction 级联）走 convert_requirement_direction_value_to_label。
"""
import json
from typing import Optional

from sqlalchemy.orm import Session

VISIT_LOG_REQUIREMENT_SCENARIO_CATEGORY_LABELS = frozenset(
    {
        "基础模型类",
        "基础算力类",
        "应用-办公类",
        "应用-生产经营类",
        "应用-研发设计类",
        "应用-营销类",
        "云及其他类",
    }
)


def format_visit_log_requirement_scenario_category_for_export(
    db: Session,
    value_string: Optional[str],
) -> str:
    if not value_string:
        return ""
    try:
        parsed = json.loads(value_string)
        if isinstance(parsed, list) and parsed:
            strs = [x for x in parsed if isinstance(x, str)]
            if strs and all(s in VISIT_LOG_REQUIREMENT_SCENARIO_CATEGORY_LABELS for s in strs):
                return ", ".join(strs)
    except (json.JSONDecodeError, TypeError):
        pass

    from app.utils.requirement_direction_utils import convert_requirement_direction_value_to_label

    return convert_requirement_direction_value_to_label(db, value_string)
