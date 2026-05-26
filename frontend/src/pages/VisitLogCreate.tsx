/**
 * 创建拜访日志页面
 */
import { useMemo, useEffect } from 'react'
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { Card, Form, Input, DatePicker, Switch, Button, message, Select, Space, Row, Col, Cascader, InputNumber } from 'antd'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { visitLogService } from '../services/visitLog'
import { workOrderService } from '../services/workOrder'
import { optionConfigService, OptionConfig } from '../services/optionConfig'
import { useAuth } from '../contexts/AuthContext'
import {
  VISIT_LOG_ENTERPRISE_TYPES,
  VISIT_LOG_DECISION_AUTHORITY_OPTIONS,
  VISIT_LOG_CURRENT_STAGE_OPTIONS,
  VISIT_LOG_STAGE_EFFORT_SUB_PHASES,
  VISIT_LOG_REQUIREMENT_SCENARIO_CATEGORIES,
  buildStageEffortBreakdownJson,
  serializeRequirementScenarioCategoryForApi,
} from '../constants/visitLog'
import type { VisitLogCurrentStageOption } from '../constants/visitLog'
import { PageBreadcrumb } from '../components/PageBreadcrumb'
import { extractErrorMessage } from '../utils/errorHandler'
import { filterProductPathsToLeavesOnly } from '../utils/productCascader'
import {
  mergeClueProductOptionsWithOther,
  pathsIncludeOther,
  serializeClueRelatedProducts,
} from '../utils/visitLogClueProducts'
import dayjs from 'dayjs'

const { TextArea } = Input

function formatWorkOrderSelectLabel(wo: any): string {
  if (!wo) return ''
  const taskInfo = wo.task_name ? `(${wo.task_name})` : `(任务ID: ${wo.task_id})`
  const customerInfo = wo.customer_unit ? ` - ${wo.customer_unit}` : ''
  return `${wo.work_order_no}${customerInfo} ${taskInfo}`
}

const convertOptionConfigToCascaderOptions = (options: OptionConfig[]): any[] => {
  return options.map((option) => ({
    value: option.value,
    label: option.label,
    children: option.children && option.children.length > 0
      ? convertOptionConfigToCascaderOptions(option.children)
      : undefined,
  }))
}

const VisitLogCreate = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { user, getCurrentRole } = useAuth()
  const currentRole = getCurrentRole()
  const queryClient = useQueryClient()
  const [form] = Form.useForm()
  
  // 从 location 获取来源页面的查询参数（分页信息）
  const getReturnUrl = () => {
    // 优先使用 location.state 中的返回 URL（如果列表页传递了）
    if (location.state && (location.state as any).returnUrl) {
      return (location.state as any).returnUrl
    }
    // 否则使用 location.search 中的参数
    const returnParams = new URLSearchParams(location.search)
    if (returnParams.toString()) {
      return `/visit-logs?${returnParams.toString()}`
    }
    return '/visit-logs'
  }

  // 获取当前用户的工单列表
  const { data: workOrdersData } = useQuery(
    'myWorkOrders',
    () => workOrderService.getWorkOrders({ page: 1, page_size: 100 }),
    {
      enabled: currentRole?.role === 'member',
    }
  )

  // 获取所有拜访日志，用于过滤已有拜访日志的工单
  const { data: visitLogsData } = useQuery(
    'visitLogs',
    () => visitLogService.getVisitLogs({ page: 1, page_size: 1000 }),
    {
      enabled: currentRole?.role === 'member',
    }
  )

  const workOrders = workOrdersData?.items || []
  const visitLogs = visitLogsData?.items || []

  /** URL 带 work_order_id 时视为从工单「拜访完成」进入，工单已确定，不允许再改选 */
  const workOrderIdParam = searchParams.get('work_order_id')
  const lockedWorkOrderId = useMemo(() => {
    if (workOrderIdParam == null || workOrderIdParam === '') return null
    const id = Number(workOrderIdParam)
    return Number.isFinite(id) && id > 0 ? id : null
  }, [workOrderIdParam])
  const isWorkOrderLocked = lockedWorkOrderId != null

  const workOrdersForSelect = useMemo(() => {
    const idsWithLog = new Set(visitLogs.map((vl: any) => vl.work_order_id))
    const filtered = workOrders.filter(
      (wo: any) =>
        wo.member_id === user?.id &&
        wo.status === 'accepted' &&
        !idsWithLog.has(wo.id)
    )
    if (lockedWorkOrderId == null) return filtered
    const locked = workOrders.find((wo: any) => wo.id === lockedWorkOrderId)
    if (locked && !filtered.some((wo: any) => wo.id === lockedWorkOrderId)) {
      return [locked, ...filtered]
    }
    return filtered
  }, [workOrders, user?.id, visitLogs, lockedWorkOrderId])

  const lockedWorkOrderLine = useMemo(() => {
    if (!isWorkOrderLocked || lockedWorkOrderId == null) return ''
    const wo = workOrders.find((w: any) => w.id === lockedWorkOrderId)
    return formatWorkOrderSelectLabel(wo) || `工单 #${lockedWorkOrderId}`
  }, [isWorkOrderLocked, lockedWorkOrderId, workOrders])

  const { data: productData } = useQuery(
    ['option-configs', 'product'],
    () => optionConfigService.getOptionConfigs('product'),
    { enabled: true }
  )
  const productOptions = useMemo(
    () =>
      productData?.items ? convertOptionConfigToCascaderOptions(productData.items) : [],
    [productData?.items]
  )
  const productOptionsWithOther = useMemo(
    () => mergeClueProductOptionsWithOther(productOptions),
    [productOptions]
  )
  
  // 处理工单选择变化，自动填充客户单位、组别（组别 = 工单组长所属 FDE 组名）
  const handleWorkOrderChange = (workOrderId: number) => {
    const selectedWorkOrder = workOrders.find((wo: any) => wo.id === workOrderId)
    if (selectedWorkOrder) {
      form.setFieldsValue({
        customer_unit: selectedWorkOrder.customer_unit || undefined,
        group_name: selectedWorkOrder.group_name || undefined,
        special_task_name: selectedWorkOrder.task_name || undefined,
        sales_unit: selectedWorkOrder.customer_source || undefined,
        // 与工单侧「行业类型」一致：有详细需求时来自详细需求，否则来自任务（见工单接口 enrich）
        industry: selectedWorkOrder.industry_type || undefined,
        customer_visit_address: selectedWorkOrder.customer_visit_address || undefined,
        customer_manager_name: selectedWorkOrder.customer_manager_name || undefined,
        customer_manager_contact: selectedWorkOrder.customer_manager_contact || undefined,
      })
    } else {
      form.setFieldsValue({
        customer_unit: undefined,
        group_name: undefined,
        special_task_name: undefined,
        sales_unit: undefined,
        industry: undefined,
        customer_visit_address: undefined,
        customer_manager_name: undefined,
        customer_manager_contact: undefined,
      })
    }
  }

  useEffect(() => {
    if (lockedWorkOrderId == null || !workOrders.length) return
    if (!workOrders.some((wo: any) => wo.id === lockedWorkOrderId)) return
    form.setFieldsValue({ work_order_id: lockedWorkOrderId })
    handleWorkOrderChange(lockedWorkOrderId)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅在工单列表加载完成或 URL 指定工单时预填一次
  }, [lockedWorkOrderId, workOrders])

  const createMutation = useMutation(visitLogService.createVisitLog, {
    onSuccess: () => {
      message.success('拜访日志创建成功')
      queryClient.invalidateQueries('visitLogs')
      queryClient.invalidateQueries('myWorkOrders')
      queryClient.invalidateQueries({ queryKey: ['workOrders'] })
      navigate(getReturnUrl())
    },
    onError: (error: unknown) => {
      message.error(extractErrorMessage(error, '创建失败'))
    },
  })

  const handleSubmit = (values: any) => {
    // 以下仅展示用，后端按工单解析快照落库
    const {
      customer_unit,
      group_name: _g,
      special_task_name: _t,
      sales_unit: _su,
      customer_visit_address: _va,
      customer_manager_name: _mn,
      customer_manager_contact: _mc,
      stage_effort,
      clue_related_product_other: _other,
      ...submitData
    } = values

    const requirementScenarioCategory = serializeRequirementScenarioCategoryForApi(
      values.requirement_scenario_category
    )

    let clueRelatedProducts: string | null = null
    try {
      clueRelatedProducts = serializeClueRelatedProducts(
        values.clue_related_products,
        values.clue_related_product_other
      )
    } catch {
      message.error('选择「其他」时请填写线索对应产品说明')
      return
    }

    const stage_effort_breakdown = buildStageEffortBreakdownJson(
      values.current_stage,
      stage_effort
    )

    const workOrderId =
      typeof submitData.work_order_id === 'number'
        ? submitData.work_order_id
        : Number(submitData.work_order_id)

    createMutation.mutate({
      ...submitData,
      work_order_id: workOrderId,
      stage_effort_breakdown: stage_effort_breakdown ?? undefined,
      clue_related_products: clueRelatedProducts,
      customized_development_requirements: values.is_customized_development
        ? String(values.customized_development_requirements ?? '').trim() || null
        : null,
      project_amount:
        values.project_amount === undefined || values.project_amount === null
          ? null
          : String(values.project_amount),
      requirement_scenario_category: requirementScenarioCategory,
      visit_date: values.visit_date.format('YYYY-MM-DD'),
    })
  }

  return (
    <div>
      <PageBreadcrumb
        items={[
          { title: '拜访日志', to: getReturnUrl() },
          { title: '添加拜访日志' },
        ]}
      />

      <Card title="添加拜访日志">
        <Form
          form={form}
          onFinish={handleSubmit}
          layout="vertical"
          initialValues={{
            has_clue: false,
            has_requirement_scenario_sorted: false,
            is_customized_development: false,
            visit_date: dayjs(),
          }}
        >
          {isWorkOrderLocked ? (
            <>
              <Form.Item name="work_order_id" hidden rules={[{ required: true, message: '缺少工单' }]}>
                <Input />
              </Form.Item>
              <Form.Item label="工单" required>
                <Input
                  readOnly
                  value={lockedWorkOrderLine}
                  placeholder="加载工单信息…"
                  style={{
                    cursor: 'default',
                    color: 'rgba(0, 0, 0, 0.88)',
                    backgroundColor: '#fff',
                  }}
                />
              </Form.Item>
            </>
          ) : (
            <Form.Item
              name="work_order_id"
              label="工单"
              required
              rules={[{ required: true, message: '请选择工单' }]}
            >
              <Select placeholder="请选择工单" onChange={handleWorkOrderChange}>
                {workOrdersForSelect.map((wo: any) => (
                  <Select.Option key={wo.id} value={wo.id}>
                    {formatWorkOrderSelectLabel(wo)}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          )}

          <Row gutter={[16, 0]}>
            <Col xs={24} md={6}>
              <Form.Item name="group_name" label="组别">
                <Input placeholder="选择工单后自动填充（组长所属组）" readOnly />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item name="special_task_name" label="专项任务">
                <Input placeholder="选择工单后自动填充（任务名称）" readOnly />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item name="sales_unit" label="所属销售单位">
                <Input placeholder="选择工单后自动填充（工单客户来源）" readOnly />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item
                name="customer_unit"
                label="客户单位"
              >
                <Input placeholder="选择工单后自动填充" readOnly />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={[16, 0]}>
            <Col xs={24} md={8}>
              <Form.Item
                name="industry"
                label="行业"
                rules={[{ required: true, message: '请输入行业' }]}
              >
                <Input
                  placeholder="选择工单后自动带出行业类型，可修改"
                  maxLength={200}
                  showCount
                />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item
                name="enterprise_type"
                label="企业类型"
                rules={[{ required: true, message: '请选择企业类型' }]}
              >
                <Select placeholder="请选择企业类型" allowClear={false}>
                  {VISIT_LOG_ENTERPRISE_TYPES.map((t) => (
                    <Select.Option key={t} value={t}>
                      {t}
                    </Select.Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={[16, 0]}>
            <Col xs={24} md={8}>
              <Form.Item
                name="visit_date"
                label="拜访日期"
                rules={[{ required: true, message: '请选择拜访日期' }]}
              >
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="customer_visit_address" label="客户拜访地址">
                <Input placeholder="选择工单后自动填充" readOnly />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="customer_manager_name" label="客户经理">
                <Input placeholder="选择工单后自动填充" readOnly />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={[16, 0]}>
            <Col xs={24} md={6}>
              <Form.Item name="customer_manager_contact" label="客户经理联系方式">
                <Input placeholder="选择工单后自动填充" readOnly />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item name="escort_staff" label="陪跑人员">
                <Input placeholder="请输入陪跑人员姓名，多人可用顿号分隔" maxLength={200} showCount />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item
                name="visit_object_position"
                label="拜访对象职位"
              >
                <Input placeholder="请输入拜访对象职位" />
              </Form.Item>
            </Col>
            <Col xs={24} md={6}>
              <Form.Item name="has_decision_authority" label="拜访对象权限">
                <Select
                  allowClear
                  placeholder="请选择"
                  options={VISIT_LOG_DECISION_AUTHORITY_OPTIONS.map((v) => ({
                    label: v,
                    value: v,
                  }))}
                />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="visit_content"
            label="拜访内容"
            rules={[{ required: true, message: '请输入拜访内容' }]}
          >
            <TextArea rows={6} placeholder="请详细描述拜访内容..." />
          </Form.Item>

          <Form.Item name="remark" label="备注">
            <TextArea rows={3} placeholder="可选：其他说明" maxLength={2000} showCount />
          </Form.Item>

          <Form.Item name="has_clue" label="是否有线索" valuePropName="checked">
            <Switch />
          </Form.Item>

          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.has_clue !== cur.has_clue}>
            {({ getFieldValue }) =>
              getFieldValue('has_clue') ? (
                <>
                  <Form.Item
                    name="has_requirement_scenario_sorted"
                    label="客户是否梳理过需求场景"
                    valuePropName="checked"
                  >
                    <Switch />
                  </Form.Item>
                  <Form.Item name="requirement_scenario_category" label="需求场景分类">
                    <Select
                      allowClear
                      placeholder="请选择需求场景分类"
                      options={VISIT_LOG_REQUIREMENT_SCENARIO_CATEGORIES.map((v) => ({
                        label: v,
                        value: v,
                      }))}
                    />
                  </Form.Item>
                  <Form.Item
                    name="clue_related_products"
                    label="线索对应产品"
                    getValueFromEvent={(selected) =>
                      filterProductPathsToLeavesOnly(
                        selected as (string | number)[][],
                        productOptionsWithOther
                      )
                    }
                  >
                    <Cascader
                      multiple
                      options={productOptionsWithOther as any}
                      showCheckedStrategy={Cascader.SHOW_CHILD}
                      displayRender={(labels) => labels.map(String).join('-')}
                      placeholder="请选择线索对应产品（仅可选最后一级，可多选）"
                      showSearch={{
                        filter: (inputValue, path) =>
                          path.some(
                            (option) =>
                              String(option.label).toLowerCase().includes(inputValue.toLowerCase())
                          ),
                      }}
                      maxTagCount="responsive"
                      onChange={(val) => {
                        if (!pathsIncludeOther(val)) {
                          form.setFieldsValue({ clue_related_product_other: undefined })
                        }
                      }}
                    />
                  </Form.Item>
                  <Form.Item
                    noStyle
                    shouldUpdate={(prev, cur) => prev.clue_related_products !== cur.clue_related_products}
                  >
                    {({ getFieldValue }) =>
                      pathsIncludeOther(getFieldValue('clue_related_products')) ? (
                        <Form.Item
                          name="clue_related_product_other"
                          label="其他产品说明"
                          rules={[
                            { required: true, message: '请填写其他线索对应产品' },
                            { whitespace: true, message: '请填写其他线索对应产品' },
                          ]}
                        >
                          <Input placeholder="请手动填写线索对应产品" maxLength={500} showCount />
                        </Form.Item>
                      ) : null
                    }
                  </Form.Item>
                  <Form.Item
                    name="is_customized_development"
                    label="是否定开"
                    valuePropName="checked"
                  >
                    <Switch
                      onChange={(checked) => {
                        if (!checked) {
                          form.setFieldsValue({ customized_development_requirements: undefined })
                        }
                      }}
                    />
                  </Form.Item>
                  <Form.Item
                    noStyle
                    shouldUpdate={(prev, cur) =>
                      prev.is_customized_development !== cur.is_customized_development
                    }
                  >
                    {({ getFieldValue }) =>
                      getFieldValue('is_customized_development') ? (
                        <Form.Item
                          name="customized_development_requirements"
                          label="定开要求"
                          rules={[
                            { required: true, message: '请填写定开要求' },
                            { whitespace: true, message: '请填写定开要求' },
                          ]}
                        >
                          <TextArea
                            rows={4}
                            placeholder="请描述定开相关要求"
                            maxLength={4000}
                            showCount
                          />
                        </Form.Item>
                      ) : null}
                  </Form.Item>
                  <Form.Item name="project_amount" label="预估金额（万元）">
                    <InputNumber
                      min={0}
                      precision={2}
                      style={{ width: '100%' }}
                      placeholder="请输入预估金额（万元）"
                    />
                  </Form.Item>
                  <Form.Item name="current_stage" label="当前阶段">
                    <Select
                      allowClear
                      placeholder="请选择当前阶段"
                      onChange={() => {
                        form.setFieldsValue({ stage_effort: undefined })
                      }}
                    >
                      {VISIT_LOG_CURRENT_STAGE_OPTIONS.map((opt) => (
                        <Select.Option key={opt} value={opt}>
                          {opt}
                        </Select.Option>
                      ))}
                    </Select>
                  </Form.Item>
                  <Form.Item
                    noStyle
                    shouldUpdate={(prev, cur) => prev.current_stage !== cur.current_stage}
                  >
                    {({ getFieldValue }) => {
                      const stage = getFieldValue('current_stage') as
                        | VisitLogCurrentStageOption
                        | undefined
                      if (!stage || !VISIT_LOG_STAGE_EFFORT_SUB_PHASES[stage]) {
                        return null
                      }
                      const subs = VISIT_LOG_STAGE_EFFORT_SUB_PHASES[stage]
                      return (
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ marginBottom: 8, color: 'rgba(0,0,0,0.45)' }}>
                            按当前阶段填写各子环节的人员与时长（选填）
                          </div>
                          {subs.map((sub) => (
                            <Row key={sub} gutter={[16, 0]} style={{ marginBottom: 8 }}>
                              <Col span={24}>
                                <div style={{ fontWeight: 500 }}>{sub}</div>
                              </Col>
                              <Col xs={24} md={12}>
                                <Form.Item
                                  name={['stage_effort', sub, 'people']}
                                  label="人员投入（人）"
                                >
                                  <InputNumber
                                    min={0}
                                    precision={1}
                                    style={{ width: '100%' }}
                                    placeholder="选填"
                                  />
                                </Form.Item>
                              </Col>
                              <Col xs={24} md={12}>
                                <Form.Item
                                  name={['stage_effort', sub, 'days']}
                                  label="投入时长（天）"
                                >
                                  <InputNumber
                                    min={0}
                                    precision={1}
                                    style={{ width: '100%' }}
                                    placeholder="选填"
                                  />
                                </Form.Item>
                              </Col>
                            </Row>
                          ))}
                        </div>
                      )
                    }}
                  </Form.Item>
                  <Form.Item name="promotion_progress" label="推进进展">
                    <TextArea rows={3} placeholder="可选：填写推进进展" maxLength={2000} showCount />
                  </Form.Item>
                  <Form.Item name="promotion_requirements" label="推进要求">
                    <TextArea rows={3} placeholder="可选：填写推进要求" maxLength={2000} showCount />
                  </Form.Item>
                </>
              ) : null
            }
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={createMutation.isLoading}>
                提交
              </Button>
              <Button onClick={() => navigate(getReturnUrl())}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}

export default VisitLogCreate
