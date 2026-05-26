/**
 * 表单字段预处理：去除首尾空格后再校验、提交。
 * 用于邮箱、手机号等易从剪贴板带入空格的输入。
 */
export function trimFormString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value
}
