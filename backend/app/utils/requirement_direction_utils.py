"""
需求方向工具函数
用于将requirement_direction的value转换为label
支持单选（字符串）和多选（JSON数组）格式
"""
import json
from typing import Optional, List
from sqlalchemy.orm import Session
from app.models.option_config import OptionConfig, OptionType


def convert_requirement_direction_value_to_label(db: Session, value_string: str) -> str:
    """
    将需求方向value字符串转换为中文标签字符串
    支持单选（字符串）和多选（JSON数组）格式
    
    单选格式: '模型 - 多模态大模型' 或 'moxing - duomotaidamloking'
    多选格式: '["算力 - 国产算力", "模型 - 通用大模型"]'
    
    这个方法会：
    1. 尝试解析为JSON数组（多选格式）
    2. 如果是数组，转换每个方向并合并显示
    3. 如果是字符串，按单选格式处理
    
    Args:
        db: 数据库会话
        value_string: 需求方向字符串，可能是单个字符串或JSON数组字符串
    
    Returns:
        中文标签字符串，多选时用逗号分隔，例如: '算力 - 国产算力, 模型 - 通用大模型'
    """
    if not value_string:
        return value_string
    
    # 尝试解析为JSON数组（多选格式）
    try:
        parsed = json.loads(value_string)
        if isinstance(parsed, list) and len(parsed) > 0:
            # 多选格式：转换每个方向
            converted_directions = []
            for direction_str in parsed:
                if isinstance(direction_str, str):
                    converted = _convert_single_direction(db, direction_str)
                    if converted:
                        converted_directions.append(converted)
            return ', '.join(converted_directions) if converted_directions else value_string
    except (json.JSONDecodeError, TypeError):
        # 不是JSON格式，按单选格式处理
        pass
    
    # 单选格式处理
    return _convert_single_direction(db, value_string)


def _convert_single_direction(db: Session, value_string: str) -> str:
    """
    转换单个需求方向字符串（内部辅助函数）
    
    Args:
        db: 数据库会话
        value_string: 单个需求方向字符串，格式为 'value1 - value2' 或 'label1 - label2'
    
    Returns:
        中文标签字符串，格式为 '标签1 - 标签2'
    """
    if not value_string:
        return value_string
    
    parts = [p.strip() for p in value_string.split(' - ')]
    converted_parts = []
    
    # 获取所有需求方向选项配置（仅查询一次）
    option_configs = db.query(OptionConfig).filter(
        OptionConfig.option_type == OptionType.REQUIREMENT_DIRECTION.value,
        OptionConfig.is_active == True
    ).all()
    
    # 构建 value -> label 映射字典
    value_to_label_map = {opt.value: opt.label for opt in option_configs}
    
    # 转换每个部分
    for part in parts:
        # 尝试从映射表中查找label
        if part in value_to_label_map:
            converted_parts.append(value_to_label_map[part])
        else:
            # 如果找不到，可能已经是label格式，或者value在数据库中不存在
            # 在这种情况下，直接使用原值
            converted_parts.append(part)
    
    return ' - '.join(converted_parts)


def convert_requirement_direction_value_to_label_cached(
    value_string: str,
    value_to_label_map: Optional[dict] = None
) -> str:
    """
    将需求方向value字符串转换为中文标签字符串（使用缓存的映射）
    支持单选（字符串）和多选（JSON数组）格式
    
    这个版本不需要数据库会话，使用预加载的映射字典
    
    Args:
        value_string: 需求方向字符串，可能是单个字符串或JSON数组字符串
        value_to_label_map: value到label的映射字典，如果为None则直接返回原值
    
    Returns:
        中文标签字符串，多选时用逗号分隔
    """
    if not value_string:
        return value_string
    
    if not value_to_label_map:
        return value_string
    
    # 尝试解析为JSON数组（多选格式）
    try:
        parsed = json.loads(value_string)
        if isinstance(parsed, list) and len(parsed) > 0:
            # 多选格式：转换每个方向
            converted_directions = []
            for direction_str in parsed:
                if isinstance(direction_str, str):
                    converted = _convert_single_direction_cached(direction_str, value_to_label_map)
                    if converted:
                        converted_directions.append(converted)
            return ', '.join(converted_directions) if converted_directions else value_string
    except (json.JSONDecodeError, TypeError):
        # 不是JSON格式，按单选格式处理
        pass
    
    # 单选格式处理
    return _convert_single_direction_cached(value_string, value_to_label_map)


def _convert_single_direction_cached(value_string: str, value_to_label_map: dict) -> str:
    """
    转换单个需求方向字符串（使用缓存的映射，内部辅助函数）
    
    Args:
        value_string: 单个需求方向字符串
        value_to_label_map: value到label的映射字典
    
    Returns:
        中文标签字符串
    """
    if not value_string:
        return value_string
    
    parts = [p.strip() for p in value_string.split(' - ')]
    converted_parts = []
    
    for part in parts:
        if part in value_to_label_map:
            converted_parts.append(value_to_label_map[part])
        else:
            converted_parts.append(part)
    
    return ' - '.join(converted_parts)

