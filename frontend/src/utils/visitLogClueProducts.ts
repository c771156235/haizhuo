/**
 * 拜访日志「线索对应产品」：级联选项末尾增加「其他」叶子，与 API JSON 数组互转。
 */
import type { ProductCascaderOption } from './productCascader'
import { filterProductPathsToLeavesOnly } from './productCascader'

/** 与 option_config 中 value 勿冲突 */
export const CLUE_PRODUCT_OTHER_VALUE = '__other__'

export function mergeClueProductOptionsWithOther(
  options: ProductCascaderOption[]
): ProductCascaderOption[] {
  const base = options ?? []
  if (base.some((o) => o.value === CLUE_PRODUCT_OTHER_VALUE)) {
    return base
  }
  return [...base, { value: CLUE_PRODUCT_OTHER_VALUE, label: '其他' }]
}

export function pathsIncludeOther(paths: unknown): boolean {
  if (!Array.isArray(paths)) return false
  return paths.some(
    (p) => Array.isArray(p) && p.length === 1 && String(p[0]) === CLUE_PRODUCT_OTHER_VALUE
  )
}

/**
 * 将接口中的 clue_related_products（JSON 字符串数组）解析为级联值 +「其他」说明。
 * 「其他」在库中存为「其他：<说明>」单行字符串。
 */
export function parseClueRelatedProductsForForm(
  value: string | null | undefined,
  cascaderOptions: ProductCascaderOption[]
): { paths: (string | number)[][] | undefined; otherText: string | undefined } {
  if (!value) return { paths: undefined, otherText: undefined }
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return { paths: undefined, otherText: undefined }
    const rawPaths: (string | number)[][] = []
    const otherChunks: string[] = []
    for (const x of parsed) {
      if (typeof x !== 'string' || !x.trim()) continue
      const t = x.trim()
      if (/^其他：/.test(t)) {
        rawPaths.push([CLUE_PRODUCT_OTHER_VALUE])
        const rest = t.replace(/^其他：/, '').trim()
        if (rest) otherChunks.push(rest)
      } else {
        const segments = t.split(' - ').map((p) => p.trim()).filter(Boolean)
        if (segments.length) rawPaths.push(segments)
      }
    }
    const seen = new Set<string>()
    const deduped: (string | number)[][] = []
    for (const p of rawPaths) {
      const k = JSON.stringify(p)
      if (seen.has(k)) continue
      seen.add(k)
      deduped.push(p)
    }
    const filtered = filterProductPathsToLeavesOnly(deduped, cascaderOptions)
    const otherText = otherChunks.length ? otherChunks.join('；') : undefined
    return {
      paths: filtered.length ? filtered : undefined,
      otherText,
    }
  } catch {
    return { paths: undefined, otherText: undefined }
  }
}

/**
 * 将表单中级联路径与「其他」说明写回 API 所需 JSON 字符串（数组序列化后由调用方 JSON.stringify 整段字段）。
 */
export function serializeClueRelatedProducts(
  paths: (string | number)[][] | undefined | null,
  otherText: string | null | undefined
): string | null {
  if (!paths?.length) return null
  const strings: string[] = []
  const trimmedOther = (otherText ?? '').trim()
  let otherWritten = false
  for (const path of paths) {
    if (!path?.length) continue
    if (path.length === 1 && String(path[0]) === CLUE_PRODUCT_OTHER_VALUE) {
      if (!trimmedOther) {
        throw new Error('CLUE_PRODUCT_OTHER_MISSING_TEXT')
      }
      if (!otherWritten) {
        strings.push(`其他：${trimmedOther}`)
        otherWritten = true
      }
    } else {
      strings.push(path.map(String).join(' - '))
    }
  }
  return strings.length ? JSON.stringify(strings) : null
}
