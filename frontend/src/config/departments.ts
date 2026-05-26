/**
 * 部门数据结构配置
 * 用于统一管理所有部门的定义
 */

export const departments = {
  '云能力中心': null,
  '海卓': null,
  '阿网': null,
  '恒联': null,
  '政企群': null,
  '商客部': null,
  '销售单位': [
    '东区',
    '中区',
    '西区',
    '北区',
    '金山',
    '浦东',
    '公共BD',
    '互联网部',
    '政务BD',
    '科创BD（含号百）',
    '南区',
    '莘闵',
    '青浦',
    '嘉定',
    '松江',
    '数集',
    '工商BD',
    '金融BD',
    '崇明',
    '奉贤',
    '战略BD',
    '互联网BD/信网部',
    '宝山',
    '理想公司',
    '云舟'
  ]
} as const

/**
 * 构建所有部门选项列表（展平一级和二级部门）
 * 用于创建任务时选择销售单位
 * @returns 部门选项数组，包含"全部"选项和所有部门
 */
export const buildSalesUnitOptions = (): string[] => {
  const options: string[] = ['全部'] // 保留"全部"选项
  
  // 遍历所有一级部门
  Object.keys(departments).forEach((dept) => {
    const subDepts = departments[dept as keyof typeof departments]
    if (subDepts === null) {
      // 没有二级部门，直接添加一级部门
      options.push(dept)
    } else {
      // 有二级部门，添加所有二级部门（格式：销售单位 - 东区）
      subDepts.forEach((subDept) => {
        options.push(`${dept} - ${subDept}`)
      })
    }
  })
  
  return options
}

