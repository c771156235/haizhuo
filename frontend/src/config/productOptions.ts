/**
 * 产品分类配置（用于级联选择器）
 * 根据需求方向分类：算力、模型、应用、定制化AI应用服务
 */

export interface ProductOption {
  value: string
  label: string
  children?: ProductOption[]
}

// 算力分类
const computingPowerOptions: ProductOption[] = [
  {
    value: 'nvidia',
    label: '英伟达',
    children: [
      {
        value: 'h800-h100',
        label: 'H800/H100同等算力系列',
        children: [
          { value: 'h800-h100-cloud-physical', label: '云端物理机' },
          { value: 'h800-h100-all-in-one', label: '一体机' },
        ],
      },
      {
        value: 'h200',
        label: 'H200同等算力系列',
        children: [
          { value: 'h200-cloud-physical', label: '云端物理机' },
          { value: 'h200-all-in-one', label: '一体机' },
        ],
      },
      {
        value: 'b200',
        label: 'B200同等算力系列',
        children: [
          { value: 'b200-cloud-physical', label: '云端物理机' },
          { value: 'b200-all-in-one', label: '一体机' },
        ],
      },
      {
        value: '4090-5090',
        label: '4090/5090同等算力系列',
        children: [
          { value: '4090-5090-cloud-host', label: '云主机' },
          { value: '4090-5090-cloud-physical', label: '云端物理机' },
          { value: '4090-5090-all-in-one', label: '一体机' },
        ],
      },
      {
        value: 'a100-a800',
        label: 'A100/A800同等算力系列',
        children: [
          { value: 'a100-a800-cloud-host', label: '云主机' },
          { value: 'a100-a800-cloud-physical', label: '云端物理机' },
          { value: 'a100-a800-all-in-one', label: '一体机' },
        ],
      },
      {
        value: 'h20',
        label: 'H20',
        children: [
          { value: 'h20-cloud-physical', label: '云端物理机' },
          { value: 'h20-all-in-one', label: '一体机' },
        ],
      },
      {
        value: 'l40s-l20',
        label: 'L40S/L20系列',
        children: [
          { value: 'l40s-l20-cloud-host', label: '云主机' },
          { value: 'l40s-l20-cloud-physical', label: '云端物理机' },
          { value: 'l40s-l20-all-in-one', label: '一体机' },
        ],
      },
    ],
  },
  {
    value: 'domestic',
    label: '国产',
    children: [
      {
        value: 'huawei-910b',
        label: '华为910B2/B3/B4',
        children: [
          { value: 'huawei-910b-intelligent-computing', label: '智算单卡多卡' },
          { value: 'huawei-910b-cloud-physical', label: '云端物理机' },
          { value: 'huawei-910b-all-in-one', label: '一体机' },
        ],
      },
      {
        value: 'muxi-c500-c550',
        label: '沐曦C500/C550',
        children: [
          { value: 'muxi-c500-c550-cloud-physical', label: '云端物理机' },
          { value: 'muxi-c500-c550-all-in-one', label: '一体机' },
        ],
      },
      {
        value: 'alibaba-ppu',
        label: '阿里PPU',
        children: [
          { value: 'alibaba-ppu-cloud-physical', label: '云端物理机' },
          { value: 'alibaba-ppu-all-in-one', label: '一体机' },
        ],
      },
      {
        value: 'baidu-p800',
        label: '百度P800',
        children: [
          { value: 'baidu-p800-cloud-physical', label: '云端物理机' },
          { value: 'baidu-p800-all-in-one', label: '一体机' },
        ],
      },
    ],
  },
]

// 模型分类
const modelOptions: ProductOption[] = [
  {
    value: 'large-models',
    label: '大模型',
    children: [
      { value: 'deepseek', label: 'Deepseek' },
      { value: 'qwen', label: 'Qwen' },
      { value: 'kimi', label: 'Kimi' },
    ],
  },
  {
    value: 'ai-applications',
    label: 'AI应用',
    children: [
      {
        value: 'ai-series',
        label: '爱系列',
        children: [
          { value: 'ai-wen', label: '爱问' },
          { value: 'ai-biancheng', label: '爱编程' },
        ],
      },
      {
        value: 'xiao-series',
        label: '晓系列',
        children: [
          { value: 'xiao-zhuren', label: '晓主任' },
          { value: 'xiao-lvshi', label: '晓律师' },
          { value: 'xiao-zhuli', label: '晓助理' },
          { value: 'xiao-qiantai', label: '晓前台' },
          { value: 'xiao-xueshu', label: '晓学术' },
          { value: 'xiao-fanyi', label: '晓翻译' },
        ],
      },
      {
        value: 'digital-employee',
        label: '数字员工',
        children: [
          { value: 'dingtalk-ai-recording', label: '钉钉AI录音卡片' },
          { value: 'digital-human', label: '数字人' },
          { value: 'mobvoi-ai-recording', label: '出门问问AI录音卡片' },
          { value: 'wenqi-digital-employee', label: '问琪数字员工' },
          { value: 'jingling-ai-recruitment', label: '菁领AI招聘助手' },
          { value: 'ai-wenxuan', label: 'AI文宣' },
          { value: 'ai-online-customer-service', label: 'AI线上客服' },
        ],
      },
    ],
  },
  {
    value: 'industry-applications',
    label: '行业应用',
    children: [
      { value: 'heihu-xiaogongdan', label: '黑湖小工单' },
    ],
  },
]

// 应用分类
const applicationOptions: ProductOption[] = [
  { value: 'ai-customer-service', label: 'AI客服' },
  { value: 'ai-wenxuan', label: 'AI文宣' },
  { value: 'ai-recruitment', label: 'AI招聘' },
  { value: 'ai-programming', label: 'AI编程' },
  { value: 'ai-cloud-computer', label: 'AI云电脑' },
  { value: 'cloud-rendering', label: '云渲染' },
  { value: 'cloud-gaming', label: '云电竞' },
  { value: 'ai-diagnosis', label: 'AI导诊' },
  { value: 'ai-document-writing', label: 'AI公文写作' },
  { value: 'ai-academic-writing', label: 'AI学术写作' },
]

// 定制化AI应用服务
const customizedServiceOptions: ProductOption[] = [
  { value: 'customized-ai-service', label: '定制化AI应用服务' },
]

// 根据需求方向返回对应的产品选项
export const getProductOptionsByRequirementDirection = (requirementDirection: string): ProductOption[] => {
  // 需求方向格式：一级分类 - 二级分类 - 三级分类
  const parts = requirementDirection.split(' - ')
  const firstLevel = parts[0]?.trim()

  switch (firstLevel) {
    case '算力':
      return computingPowerOptions
    case '模型':
      return modelOptions
    case '应用':
      return applicationOptions
    case '定制化AI应用服务':
      return customizedServiceOptions
    default:
      // 默认返回所有选项（用于创建时）
      return [
        {
          value: 'computing-power',
          label: '算力',
          children: computingPowerOptions,
        },
        {
          value: 'model',
          label: '模型',
          children: modelOptions,
        },
        {
          value: 'application',
          label: '应用',
          children: applicationOptions,
        },
        {
          value: 'customized-service',
          label: '定制化AI应用服务',
          children: customizedServiceOptions,
        },
      ]
  }
}

// 获取所有产品选项（用于创建商机时的完整选择）
export const getAllProductOptions = (): ProductOption[] => {
  return [
    {
      value: 'computing-power',
      label: '算力',
      children: computingPowerOptions,
    },
    {
      value: 'model',
      label: '模型',
      children: modelOptions,
    },
    {
      value: 'application',
      label: '应用',
      children: applicationOptions,
    },
    {
      value: 'customized-service',
      label: '定制化AI应用服务',
      children: customizedServiceOptions,
    },
  ]
}

