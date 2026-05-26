"""
产品工具函数
用于将产品value字符串转换为中文标签
支持单选（字符串）和多选（JSON数组）格式
"""
import json
from typing import Optional
from sqlalchemy.orm import Session
from app.models.option_config import OptionConfig, OptionType

# 产品选项映射字典（与前端保持一致，作为备用）
PRODUCT_OPTIONS_MAP = {
    # 一级分类
    "computing-power": "算力",
    "model": "模型",
    "application": "应用",
    "customized-service": "定制化AI应用服务",
    
    # 算力 - 英伟达
    "nvidia": "英伟达",
    "domestic": "国产",
    
    # 算力 - 英伟达 - H800/H100同等算力系列
    "h800-h100": "H800/H100同等算力系列",
    "h800-h100-cloud-physical": "云端物理机",
    "h800-h100-all-in-one": "一体机",
    
    # 算力 - 英伟达 - H200同等算力系列
    "h200": "H200同等算力系列",
    "h200-cloud-physical": "云端物理机",
    "h200-all-in-one": "一体机",
    
    # 算力 - 英伟达 - B200同等算力系列
    "b200": "B200同等算力系列",
    "b200-cloud-physical": "云端物理机",
    "b200-all-in-one": "一体机",
    
    # 算力 - 英伟达 - 4090/5090同等算力系列
    "4090-5090": "4090/5090同等算力系列",
    "4090-5090-cloud-host": "云主机",
    "4090-5090-cloud-physical": "云端物理机",
    "4090-5090-all-in-one": "一体机",
    
    # 算力 - 英伟达 - A100/A800同等算力系列
    "a100-a800": "A100/A800同等算力系列",
    "a100-a800-cloud-host": "云主机",
    "a100-a800-cloud-physical": "云端物理机",
    "a100-a800-all-in-one": "一体机",
    
    # 算力 - 英伟达 - H20
    "h20": "H20",
    "h20-cloud-physical": "云端物理机",
    "h20-all-in-one": "一体机",
    
    # 算力 - 英伟达 - L40S/L20系列
    "l40s-l20": "L40S/L20系列",
    "l40s-l20-cloud-host": "云主机",
    "l40s-l20-cloud-physical": "云端物理机",
    "l40s-l20-all-in-one": "一体机",
    
    # 算力 - 国产 - 华为910B2/B3/B4
    "huawei-910b": "华为910B2/B3/B4",
    "huawei-910b-intelligent-computing": "智算单卡多卡",
    "huawei-910b-cloud-physical": "云端物理机",
    "huawei-910b-all-in-one": "一体机",
    
    # 算力 - 国产 - 沐曦C500/C550
    "muxi-c500-c550": "沐曦C500/C550",
    "muxi-c500-c550-cloud-physical": "云端物理机",
    "muxi-c500-c550-all-in-one": "一体机",
    
    # 算力 - 国产 - 阿里PPU
    "alibaba-ppu": "阿里PPU",
    "alibaba-ppu-cloud-physical": "云端物理机",
    "alibaba-ppu-all-in-one": "一体机",
    
    # 算力 - 国产 - 百度P800
    "baidu-p800": "百度P800",
    "baidu-p800-cloud-physical": "云端物理机",
    "baidu-p800-all-in-one": "一体机",
    
    # 模型 - 大模型
    "large-models": "大模型",
    "deepseek": "Deepseek",
    "qwen": "Qwen",
    "kimi": "Kimi",
    
    # 模型 - AI应用
    "ai-applications": "AI应用",
    "ai-series": "爱系列",
    "ai-wen": "爱问",
    "ai-biancheng": "爱编程",
    "xiao-series": "晓系列",
    "xiao-zhuren": "晓主任",
    "xiao-lvshi": "晓律师",
    "xiao-zhuli": "晓助理",
    "xiao-qiantai": "晓前台",
    "xiao-xueshu": "晓学术",
    "xiao-fanyi": "晓翻译",
    "digital-employee": "数字员工",
    "dingtalk-ai-recording": "钉钉AI录音卡片",
    "digital-human": "数字人",
    "mobvoi-ai-recording": "出门问问AI录音卡片",
    "wenqi-digital-employee": "问琪数字员工",
    "jingling-ai-recruitment": "菁领AI招聘助手",
    "ai-wenxuan": "AI文宣",
    "ai-online-customer-service": "AI线上客服",
    
    # 模型 - 行业应用
    "industry-applications": "行业应用",
    "heihu-xiaogongdan": "黑湖小工单",
    
    # 应用
    "ai-customer-service": "AI客服",
    "ai-recruitment": "AI招聘",
    "ai-programming": "AI编程",
    "ai-cloud-computer": "AI云电脑",
    "cloud-rendering": "云渲染",
    "cloud-gaming": "云电竞",
    "ai-diagnosis": "AI导诊",
    "ai-document-writing": "AI公文写作",
    "ai-academic-writing": "AI学术写作",
    
    # 定制化AI应用服务
    "customized-ai-service": "定制化AI应用服务",
}


def convert_product_value_to_label(value_string: str, db: Optional[Session] = None) -> str:
    """
    将产品value字符串转换为中文标签字符串
    支持单选（字符串）和多选（JSON数组）格式
    
    单选格式: 'computing-power - nvidia - h200 - h200-all-in-one'
    多选格式: '["算力 - 英伟达 - H200同等算力系列 - 一体机", "模型 - 通用大模型"]'
    
    优先从数据库的 option_configs 表中查找，如果找不到则使用硬编码映射
    
    Args:
        value_string: 产品value字符串，可能是单个字符串或JSON数组字符串
        db: 数据库会话（可选），如果提供则从数据库查找
    
    Returns:
        中文标签字符串，多选时用逗号分隔，例如: '算力 - 英伟达 - H200同等算力系列 - 一体机, 模型 - 通用大模型'
    """
    if not value_string:
        return value_string
    
    # 尝试解析为JSON数组（多选格式）
    try:
        parsed = json.loads(value_string)
        if isinstance(parsed, list) and len(parsed) > 0:
            # 多选格式：转换每个产品
            converted_products = []
            for product_str in parsed:
                if isinstance(product_str, str):
                    converted = _convert_single_product(product_str, db)
                    if converted:
                        converted_products.append(converted)
            return ', '.join(converted_products) if converted_products else value_string
    except (json.JSONDecodeError, TypeError):
        # 不是JSON格式，按单选格式处理
        pass
    
    # 单选格式处理
    return _convert_single_product(value_string, db)


def _convert_single_product(value_string: str, db: Optional[Session] = None) -> str:
    """
    转换单个产品字符串（内部辅助函数）
    
    Args:
        value_string: 单个产品value字符串，格式为 'value1 - value2 - value3'
        db: 数据库会话（可选）
    
    Returns:
        中文标签字符串，格式为 '标签1 - 标签2 - 标签3'
    """
    if not value_string:
        return value_string

    stripped = value_string.strip()
    if stripped.startswith("其他："):
        return stripped
    
    values = [v.strip() for v in value_string.split(' - ')]
    labels = []
    
    # 如果提供了数据库会话，优先从数据库查找
    if db:
        option_configs = db.query(OptionConfig).filter(
            OptionConfig.option_type == OptionType.PRODUCT.value,
            OptionConfig.is_active == True
        ).all()
        
        # 构建 value -> label 映射字典
        value_to_label_map = {opt.value: opt.label for opt in option_configs}
        
        for value in values:
            # 先尝试从数据库查找
            if value in value_to_label_map:
                labels.append(value_to_label_map[value])
            # 如果数据库找不到，尝试硬编码映射
            elif value in PRODUCT_OPTIONS_MAP:
                labels.append(PRODUCT_OPTIONS_MAP[value])
            else:
                # 如果都找不到，使用原值
                labels.append(value)
    else:
        # 没有数据库会话，只使用硬编码映射
        for value in values:
            label = PRODUCT_OPTIONS_MAP.get(value, value)  # 如果找不到映射，使用原值
            labels.append(label)
    
    return ' - '.join(labels)

