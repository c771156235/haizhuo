/**
 * 线索维护窄域更新页（仅维护：线索对应产品、预估金额、当前阶段、推进进展追加、推进要求）
 */
import { useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Card,
  Form,
  Input,
  Button,
  message,
  Space,
  Result,
  Select,
  Cascader,
  InputNumber,
  Timeline,
  Typography,
  Row,
  Col,
} from 'antd'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { visitLogService, type VisitLogMaintenancePayload } from '../services/visitLog'
import { optionConfigService, OptionConfig } from '../services/optionConfig'
import {
  VISIT_LOG_CURRENT_STAGE_OPTIONS,
  VISIT_LOG_STAGE_EFFORT_SUB_PHASES,
  buildStageEffortBreakdownJson,
  parseStageEffortBreakdownForForm,
} from '../constants/visitLog'
import type { VisitLogCurrentStageOption } from '../constants/visitLog'
import Loading from '../components/Loading'
import { PageBreadcrumb } from '../components/PageBreadcrumb'
import { filterProductPathsToLeavesOnly } from '../utils/productCascader'
import {
  mergeClueProductOptionsWithOther,
  parseClueRelatedProductsForForm,
  pathsIncludeOther,
  serializeClueRelatedProducts,
} from '../utils/visitLogClueProducts'
import { extractErrorMessage } from '../utils/errorHandler'
import { parseProgressHistory, formatProgressHistoryAt } from '../utils/visitLogProgressHistory'

const { TextArea } = Input
const { Text } = Typography

const convertOptionConfigToCascaderOptions = (options: OptionConfig[]): any[] => {
  return options.map((option) => ({
    value: option.value,
    label: option.label,
    children: option.children && option.children.length > 0
      ? convertOptionConfigToCascaderOptions(option.children)
      : undefined,
  }))
}

const VisitLogEdit = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form] = Form.useForm()
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

  const { data: visitLog, isLoading } = useQuery(
    ['visitLog', id],
    () => visitLogService.getVisitLog(Number(id!)),
    {
      enabled: !!id,
      onSuccess: (data) => {
        form.setFieldsValue({
          project_amount:
            data.project_amount === undefined ||
            data.project_amount === null ||
            data.project_amount === ''
              ? undefined
              : Number(data.project_amount),
          current_stage: data.current_stage || undefined,
          stage_effort: parseStageEffortBreakdownForForm(
            data.current_stage,
            data.stage_effort_breakdown
          ),
          promotion_requirements: data.promotion_requirements || '',
          promotion_progress_append: '',
        })
      },
    }
  )

  useEffect(() => {
    if (!visitLog?.id || isLoading) return
    const { paths, otherText } = parseClueRelatedProductsForForm(
      visitLog.clue_related_products,
      productOptionsWithOther
    )
    form.setFieldsValue({
      clue_related_products: paths,
      clue_related_product_other: otherText,
    })
  }, [visitLog?.id, visitLog?.clue_related_products, productOptionsWithOther, isLoading, form])

  const updateMutation = useMutation(
    (data: VisitLogMaintenancePayload) => visitLogService.updateVisitLog(Number(id!), data),
    {
      onSuccess: () => {
        message.success('更新成功')
        queryClient.invalidateQueries(['visitLog', id])
        queryClient.invalidateQueries('visitLogs')
        navigate(`/visit-logs/${id}`)
      },
      onError: (error: unknown) => {
        message.error(extractErrorMessage(error, '更新失败'))
      },
    }
  )

  const handleSubmit = (values: any) => {
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
      values.stage_effort
    )

    const body: Record<string, unknown> = {
      clue_related_products: clueRelatedProducts,
      project_amount:
        values.project_amount === undefined || values.project_amount === null
          ? null
          : String(values.project_amount),
      current_stage: values.current_stage ?? null,
      stage_effort_breakdown: stage_effort_breakdown ?? null,
      promotion_requirements: values.promotion_requirements ?? '',
    }
    const append = (values.promotion_progress_append || '').trim()
    if (append) {
      body.promotion_progress_append = append
    }
    updateMutation.mutate(body as VisitLogMaintenancePayload)
  }

  if (isLoading) {
    return <Loading tip="加载线索维护信息..." />
  }

  if (!visitLog) {
    return (
      <Result
        status="404"
        title="404"
        subTitle="未找到线索维护记录"
        extra={
          <Button type="primary" onClick={() => navigate('/visit-logs')}>
            返回线索维护列表
          </Button>
        }
      />
    )
  }

  const history = parseProgressHistory(visitLog.promotion_progress_history)

  return (
    <div>
      <PageBreadcrumb
        items={[
          { title: '线索维护', to: '/visit-logs' },
          { title: '日志详情', to: `/visit-logs/${id}` },
          { title: '更新' },
        ]}
      />

      <Card title="更新线索维护">
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Text type="secondary">工单 </Text>
            <Text strong>{visitLog.work_order_no || `#${visitLog.work_order_id}`}</Text>
            {visitLog.work_order_customer_unit || visitLog.customer_unit ? (
              <>
                <Text type="secondary"> · 客户单位 </Text>
                <Text>{visitLog.work_order_customer_unit || visitLog.customer_unit}</Text>
              </>
            ) : null}
          </div>

          <Form form={form} onFinish={handleSubmit} layout="vertical">
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
                    path.some((option) =>
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
                  <div style={{ marginBottom: 16 }}>
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

            <Form.Item label="推进进展（历史，只读）">
              {history.length > 0 ? (
                <Timeline
                  items={history.map((e) => ({
                    children: (
                      <div>
                        <Text type="secondary">
                          {formatProgressHistoryAt(e.at)}
                          {e.user_name ? ` · ${e.user_name}` : ''}
                        </Text>
                        <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{e.text}</div>
                      </div>
                    ),
                  }))}
                />
              ) : (
                <Text type="secondary">
                  {visitLog.promotion_progress?.trim()
                    ? visitLog.promotion_progress
                    : '暂无记录；可在下方填写本次推进进展并保存，将自动附带时间与操作人'}
                </Text>
              )}
            </Form.Item>

            <Form.Item
              name="promotion_progress_append"
              label="本次推进进展（追加）"
              extra="保存后将追加一条记录，并自动记录操作人与时间"
            >
              <TextArea rows={3} placeholder="填写本次新增的推进内容（可选）" maxLength={2000} showCount />
            </Form.Item>

            <Form.Item name="promotion_requirements" label="推进要求">
              <TextArea rows={3} placeholder="推进要求" maxLength={2000} showCount />
            </Form.Item>

            <Form.Item>
              <Space>
                <Button type="primary" htmlType="submit" loading={updateMutation.isLoading}>
                  保存
                </Button>
                <Button onClick={() => navigate(`/visit-logs/${id}`)}>取消</Button>
              </Space>
            </Form.Item>
          </Form>
        </Space>
      </Card>
    </div>
  )
}

export default VisitLogEdit
