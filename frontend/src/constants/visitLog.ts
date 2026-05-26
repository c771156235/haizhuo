/** 拜访日志 — 需求场景分类（固定枚举；存库为 JSON 数组至多一项，与后端一致） */
export const VISIT_LOG_REQUIREMENT_SCENARIO_CATEGORIES = [
  '基础模型类',
  '基础算力类',
  '应用-办公类',
  '应用-生产经营类',
  '应用-研发设计类',
  '应用-营销类',
  '云及其他类',
] as const

const REQUIREMENT_SCENARIO_LABEL_SET = new Set<string>(VISIT_LOG_REQUIREMENT_SCENARIO_CATEGORIES)

/** 列表/详情展示 */
export function formatRequirementScenarioCategoryDisplay(value?: string | null): string {
  if (!value?.trim()) return '-'
  try {
    const parsed = JSON.parse(value) as unknown
    if (Array.isArray(parsed)) {
      const texts = parsed.filter((x): x is string => typeof x === 'string')
      return texts.length > 0 ? texts.join('，') : '-'
    }
  } catch {
    return value
  }
  return '-'
}

/** 更新页表单单选回填：仅识别固定枚举（旧版级联路径无法对应选项时为空） */
export function parseRequirementScenarioCategoryForForm(
  value?: string | null
): string | undefined {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return undefined
    for (const x of parsed) {
      if (typeof x === 'string' && REQUIREMENT_SCENARIO_LABEL_SET.has(x)) return x
    }
  } catch {
    return undefined
  }
  return undefined
}

/** 提交存库：单选至多一项，JSON 数组 */
export function serializeRequirementScenarioCategoryForApi(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  if (!REQUIREMENT_SCENARIO_LABEL_SET.has(value)) return null
  return JSON.stringify([value])
}

/** 拜访日志 — 企业类型（与后端 VISIT_LOG_ENTERPRISE_TYPES 一致） */
export const VISIT_LOG_ENTERPRISE_TYPES = [
  '大型企业',
  '小微企业',
  '中型企业',
  '事业单位',
  '政府单位',
] as const

export type VisitLogEnterpriseType = (typeof VISIT_LOG_ENTERPRISE_TYPES)[number]

/** 拜访对象权限选项：建议权 / 决策权 / 无（与后端 VISIT_LOG_DECISION_AUTHORITY_OPTIONS 一致） */
export const VISIT_LOG_DECISION_AUTHORITY_OPTIONS = ['建议权', '决策权', '无'] as const

export type VisitLogDecisionAuthorityOption = (typeof VISIT_LOG_DECISION_AUTHORITY_OPTIONS)[number]

/** 当前阶段选项（与后端 VISIT_LOG_CURRENT_STAGE_OPTIONS 一致） */
export const VISIT_LOG_CURRENT_STAGE_OPTIONS = [
  '需求排摸',
  '标品试用',
  'POC测试',
  '转商交付',
  '流失',
] as const

export type VisitLogCurrentStageOption = (typeof VISIT_LOG_CURRENT_STAGE_OPTIONS)[number]

/**
 * 各「当前阶段」下需分别填写「人员投入（人）」「投入时长（天）」的子环节名称（与业务约定一致）
 */
export const VISIT_LOG_STAGE_EFFORT_SUB_PHASES: Record<
  VisitLogCurrentStageOption,
  readonly string[]
> = {
  POC测试: ['需求排摸', '标品试用', 'POC测试'],
  标品试用: ['需求排摸', '标品试用'],
  流失: ['需求排摸', '方案报价'],
  需求排摸: ['需求排摸'],
  转商交付: ['需求排摸', '标品试用', 'POC测试', '转商交付'],
}

/** 表单内按子环节维护人员/天数 */
export type VisitLogStageEffortForm = Record<
  string,
  { people?: number | null; days?: number | null }
>

export function buildStageEffortBreakdownJson(
  currentStage: string | undefined | null,
  effort: VisitLogStageEffortForm | undefined
): string | null {
  if (!currentStage || !(currentStage in VISIT_LOG_STAGE_EFFORT_SUB_PHASES)) {
    return null
  }
  const subs =
    VISIT_LOG_STAGE_EFFORT_SUB_PHASES[currentStage as VisitLogCurrentStageOption]
  const arr = subs.map((sub_phase) => {
    const row = effort?.[sub_phase]
    return {
      sub_phase,
      people: row?.people ?? null,
      days: row?.days ?? null,
    }
  })
  const hasAny = arr.some((r) => r.people != null || r.days != null)
  if (!hasAny) return null
  return JSON.stringify(arr)
}

/** 详情页/列表展示用 */
export function formatStageEffortBreakdownDisplay(raw?: string | null): string {
  if (!raw?.trim()) return '-'
  try {
    const data = JSON.parse(raw) as unknown
    if (!Array.isArray(data)) return raw
    const parts: string[] = []
    for (const item of data) {
      if (!item || typeof item !== 'object') continue
      const sp = (item as { sub_phase?: string }).sub_phase
      if (typeof sp !== 'string') continue
      const pe = (item as { people?: unknown }).people
      const da = (item as { days?: unknown }).days
      if (pe == null && da == null) continue
      const pS = pe == null ? '' : String(pe)
      const dS = da == null ? '' : String(da)
      parts.push(`${sp}：人员${pS}人，时长${dS}天`)
    }
    return parts.length > 0 ? parts.join('；') : '-'
  } catch {
    return raw
  }
}

export function parseStageEffortBreakdownForForm(
  currentStage: string | undefined | null,
  jsonStr: string | undefined | null
): VisitLogStageEffortForm | undefined {
  if (!currentStage || !(currentStage in VISIT_LOG_STAGE_EFFORT_SUB_PHASES)) {
    return undefined
  }
  if (!jsonStr?.trim()) return undefined
  const subs =
    VISIT_LOG_STAGE_EFFORT_SUB_PHASES[currentStage as VisitLogCurrentStageOption]
  try {
    const data = JSON.parse(jsonStr) as unknown
    if (!Array.isArray(data)) return undefined
    const out: VisitLogStageEffortForm = {}
    for (const item of data) {
      if (
        item &&
        typeof item === 'object' &&
        typeof (item as { sub_phase?: string }).sub_phase === 'string' &&
        subs.includes((item as { sub_phase: string }).sub_phase)
      ) {
        const sp = (item as { sub_phase: string }).sub_phase
        const people = (item as { people?: unknown }).people
        const days = (item as { days?: unknown }).days
        out[sp] = {
          people:
            people != null && people !== ''
              ? Number(people as number | string)
              : undefined,
          days:
            days != null && days !== ''
              ? Number(days as number | string)
              : undefined,
        }
      }
    }
    return out
  } catch {
    return undefined
  }
}
