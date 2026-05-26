/** 解析 visit_logs.promotion_progress_history（JSON 数组） */
import dayjs from 'dayjs'

/** 与详情「更新时间」一致：ISO8601（含 Z）按浏览器本地时区格式化 */
export function formatProgressHistoryAt(at?: string | null): string {
  if (at == null || at === '') return '—'
  const s = String(at).trim()
  if (/^\d{4}-\d{2}-\d{2}T/.test(s) || s.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(s)) {
    const d = dayjs(s)
    return d.isValid() ? d.format('YYYY-MM-DD HH:mm:ss') : s
  }
  return s
}

export type ProgressHistoryEntry = {
  at?: string | null
  user_id?: number | null
  user_name?: string | null
  text: string
}

export function parseProgressHistory(raw?: string | null): ProgressHistoryEntry[] {
  if (!raw || !String(raw).trim()) return []
  try {
    const data = JSON.parse(raw) as unknown
    if (!Array.isArray(data)) return []
    return data.filter(
      (item): item is ProgressHistoryEntry =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as ProgressHistoryEntry).text === 'string'
    )
  } catch {
    return []
  }
}
