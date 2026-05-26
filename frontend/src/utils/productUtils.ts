/**
 * 产品工具函数
 */
import { getAllProductOptions, ProductOption } from '../config/productOptions'

/**
 * 递归查找产品选项的标签
 */
function findProductLabel(options: ProductOption[], value: string): string | null {
  for (const option of options) {
    if (option.value === value) {
      return option.label
    }
    if (option.children) {
      const found = findProductLabel(option.children, value)
      if (found) return found
    }
  }
  return null
}

/**
 * 将产品value字符串转换为中文标签字符串
 * 支持单选（字符串）和多选（JSON数组）格式
 * 
 * 单选格式: 'computing-power - nvidia - h200 - h200-all-in-one' 
 * 多选格式: '["算力 - 英伟达 - H200同等算力系列 - 一体机", "模型 - 通用大模型"]'
 * 
 * 返回: 多选时用逗号分隔的字符串
 */
export function convertProductValueToLabel(valueString: string): string {
  if (!valueString) return valueString
  
  const convertSingle = (single: string): string => {
    const trimmed = single.trim()
    if (/^其他：/.test(trimmed)) {
      return trimmed
    }
    const allOptions = getAllProductOptions()
    const values = single.split(' - ').map((v) => v.trim())
    const labels: string[] = []

    for (const value of values) {
      const label = findProductLabel(allOptions, value)
      labels.push(label || value) // 如果找不到标签，使用原值
    }

    return labels.join(' - ')
  }

  // 尝试解析为JSON数组（多选格式）
  try {
    const parsed = JSON.parse(valueString)
    if (Array.isArray(parsed) && parsed.length > 0) {
      // 多选格式：逐项转换，避免直接展示 value（如 nvidia/h200 等）
      const converted = parsed
        .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        .map((s) => convertSingle(s))
      return converted.length > 0 ? converted.join(', ') : valueString
    }
  } catch (e) {
    // 不是JSON格式，按单选格式处理
  }
  
  // 单选格式处理
  return convertSingle(valueString)
}

/**
 * 将产品value字符串转换为value数组
 * 例如: 'computing-power - nvidia - h200 - h200-all-in-one'
 * 转换为: ['computing-power', 'nvidia', 'h200', 'h200-all-in-one']
 */
export function convertProductStringToArray(valueString: string): string[] {
  if (!valueString) return []
  return valueString.split(' - ').map(v => v.trim())
}

