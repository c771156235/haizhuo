/**
 * 商机详情页面
 */
import { useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Card, Descriptions, Tag, Button, Space, message, Modal, Form, Input, Select, Table, Result, InputNumber } from 'antd'
import { opportunityService } from '../services/opportunity'
import { useAuth } from '../contexts/AuthContext'
import Loading from '../components/Loading'
import ErrorBoundary from '../components/ErrorBoundary'
import { PageBreadcrumb } from '../components/PageBreadcrumb'
import dayjs from 'dayjs'
import { convertProductValueToLabel } from '../utils/productUtils'
import { extractErrorMessage } from '../utils/errorHandler'
import { OpportunityStatusLabels, OpportunityStatusColors } from '../types/opportunity'

const { TextArea } = Input

const OpportunityDetail = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  
  // 从 location 获取来源页面的查询参数（分页信息）
  const getReturnUrl = () => {
    const searchParams = new URLSearchParams(location.search)
    // 如果有查询参数，返回时带上这些参数
    if (searchParams.toString()) {
      return `/opportunities?${searchParams.toString()}`
    }
    return '/opportunities'
  }
  const { user, getCurrentRole } = useAuth()
  const currentRole = getCurrentRole()
  const queryClient = useQueryClient()
  const [statusModalVisible, setStatusModalVisible] = useState(false)
  const [memberModalVisible, setMemberModalVisible] = useState(false)
  const [statusForm] = Form.useForm()
  const [memberForm] = Form.useForm()

  const { data: opportunity, isLoading, error, refetch } = useQuery(
    ['opportunity', id],
    () => opportunityService.getOpportunity(Number(id!)),
    { 
      enabled: !!id,
      staleTime: 0, // 禁用缓存，总是获取最新数据
      cacheTime: 0,
    }
  )

  // 调试：打印商机数据
  if (opportunity) {
    console.log('详情页 - 商机数据:', opportunity)
    console.log('详情页 - expected_amount:', opportunity.expected_amount)
  }

  const updateStatusMutation = useMutation(
    (data: any) => opportunityService.updateOpportunity(Number(id!), data),
    {
      onSuccess: () => {
        message.success('状态更新成功')
        setStatusModalVisible(false)
        statusForm.resetFields()
        queryClient.invalidateQueries(['opportunity', id])
        queryClient.invalidateQueries('opportunities')
      },
      onError: (error: unknown) => {
        message.error(extractErrorMessage(error, '更新失败'))
      },
    }
  )

  const addMemberMutation = useMutation(
    (data: any) => opportunityService.addCollaborativeMember(Number(id!), data),
    {
      onSuccess: () => {
        message.success('协同人员添加成功')
        setMemberModalVisible(false)
        memberForm.resetFields()
        queryClient.invalidateQueries(['opportunity', id])
      },
      onError: (error: unknown) => {
        message.error(extractErrorMessage(error, '添加失败'))
      },
    }
  )

  if (isLoading) {
    return <Loading tip="加载商机详情..." />
  }

  if (error) {
    return <ErrorBoundary error={error as Error} onRetry={() => refetch()} title="加载商机失败" />
  }

  if (!opportunity) {
    return (
      <Result
        status="404"
        title="404"
        subTitle="商机不存在"
        extra={
          <Button type="primary" onClick={() => navigate('/opportunities')}>
            返回商机列表
          </Button>
        }
      />
    )
  }

  const collaborativeMemberColumns = [
    {
      title: '成员',
      key: 'member',
      render: (_: any, record: any) => (
        record.member_name ? (
          <span>{record.member_name}</span>
        ) : (
          <span>用户 #{record.member_id}</span>
        )
      ),
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
    },
    {
      title: '说明',
      dataIndex: 'description',
      key: 'description',
    },
    {
      title: '添加时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm'),
    },
  ]

  return (
    <div>
      <PageBreadcrumb
        items={[
          { title: '商机管理', to: getReturnUrl() },
          { title: opportunity.opportunity_no || '商机详情' },
        ]}
      />

      <Card title="商机详情">
        <Descriptions column={2} bordered>
          <Descriptions.Item label="商机编号">{opportunity.opportunity_no}</Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag color={OpportunityStatusColors[opportunity.status]}>
              {OpportunityStatusLabels[opportunity.status] || opportunity.status}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="任务">
            {opportunity.task_name ? (
              <Space>
                <Button 
                  type="link" 
                  style={{ padding: 0 }}
                  onClick={() => navigate(`/tasks/${opportunity.task_id}`)}
                >
                  {opportunity.task_name}
                </Button>
                {opportunity.task_sales_unit && (
                  <span style={{ color: '#8c8c8c', fontSize: '12px' }}>
                    ({opportunity.task_sales_unit})
                  </span>
                )}
              </Space>
            ) : (
              <span>任务 #{opportunity.task_id}</span>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="客户单位">{opportunity.customer_unit}</Descriptions.Item>
          <Descriptions.Item label="组长" span={2}>
            {opportunity.team_leader_name ? (
              <span>{opportunity.team_leader_name}</span>
            ) : (
              <span>用户 #{opportunity.team_leader_id}</span>
            )}
          </Descriptions.Item>
          {opportunity.required_products && (
            <Descriptions.Item label="所需产品" span={2}>
              <Space wrap>
                {convertProductValueToLabel(opportunity.required_products).split(', ').map((product: string, index: number) => (
                  <Tag key={index} color="blue">{product.trim()}</Tag>
                ))}
              </Space>
            </Descriptions.Item>
          )}
          {opportunity.description && (
            <Descriptions.Item label="商机描述" span={2}>
              {opportunity.description}
            </Descriptions.Item>
          )}
          {(opportunity.expected_amount !== null && opportunity.expected_amount !== undefined && opportunity.expected_amount !== '') && (
            <Descriptions.Item label="预计金额" span={2}>
              {opportunity.expected_amount} 万元
            </Descriptions.Item>
          )}
          {/* 根据状态显示流失原因或转定金额 */}
          {opportunity.status === 'lost' && (
            <Descriptions.Item label="流失原因" span={2}>
              {opportunity.lost_reason || '-'}
            </Descriptions.Item>
          )}
          {opportunity.status === 'won' && (
            <Descriptions.Item label="转定金额" span={2}>
              {opportunity.won_amount ? `${opportunity.won_amount} 万元` : '-'}
            </Descriptions.Item>
          )}
          <Descriptions.Item label="创建时间" span={opportunity.status_changed_at ? 1 : 2}>
            {dayjs(opportunity.created_at).format('YYYY-MM-DD HH:mm:ss')}
          </Descriptions.Item>
          {opportunity.status_changed_at && (
            <Descriptions.Item label="状态变更时间">
              {dayjs(opportunity.status_changed_at).format('YYYY-MM-DD HH:mm:ss')}
            </Descriptions.Item>
          )}
        </Descriptions>

        {/* 协同人员列表 */}
        {opportunity.collaborative_members && opportunity.collaborative_members.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <h3>协同人员</h3>
            <Table
              columns={collaborativeMemberColumns}
              dataSource={opportunity.collaborative_members}
              rowKey="id"
              pagination={false}
            />
          </div>
        )}

        <div style={{ marginTop: 24 }}>
          <Space>
            {currentRole?.role === 'team_leader' && (
              <>
                <Button type="primary" onClick={() => navigate(`/opportunities/${id}/edit`)}>
                  编辑
                </Button>
                <Button onClick={() => setStatusModalVisible(true)}>更新状态</Button>
              </>
            )}
            {currentRole?.role === 'member' && (
              <>
                <Button onClick={() => setStatusModalVisible(true)}>更新状态</Button>
                <Button type="primary" onClick={() => setMemberModalVisible(true)}>
                  添加为协同人员
                </Button>
              </>
            )}
          </Space>
        </div>
      </Card>

      {/* 更新状态模态框 */}
      <Modal
        title="更新商机状态"
        open={statusModalVisible}
        onCancel={() => {
          setStatusModalVisible(false)
          statusForm.resetFields()
        }}
        onOk={() => statusForm.submit()}
        confirmLoading={updateStatusMutation.isLoading}
      >
        <Form
          form={statusForm}
          onFinish={(values) => {
            // 处理转定金额：InputNumber返回数字，需要转换为字符串
            let wonAmount: string | undefined = undefined
            if (values.won_amount !== null && values.won_amount !== undefined && values.won_amount !== '') {
              const numValue = Number(values.won_amount)
              if (!isNaN(numValue) && isFinite(numValue)) {
                // 保留最多2位小数，移除末尾零
                wonAmount = numValue.toFixed(2).replace(/\.?0+$/, '')
              }
            }

            const submitData = {
              ...values,
              won_amount: wonAmount || null,
            }

            console.log('更新状态 - 提交数据:', submitData) // 调试用
            updateStatusMutation.mutate(submitData)
          }}
          layout="vertical"
        >
          <Form.Item name="status" label="状态" rules={[{ required: true }]}>
            <Select>
              <Select.Option value="in_progress">进行中</Select.Option>
              <Select.Option value="lost">流失</Select.Option>
              <Select.Option value="won">转定</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) =>
              prevValues.status !== currentValues.status
            }
          >
            {({ getFieldValue }) =>
              getFieldValue('status') === 'lost' ? (
                <Form.Item name="lost_reason" label="流失原因" rules={[{ required: true }]}>
                  <TextArea rows={4} />
                </Form.Item>
              ) : getFieldValue('status') === 'won' ? (
                <Form.Item name="won_amount" label="转定金额">
                  <Space.Compact style={{ width: '100%' }}>
                    <InputNumber
                      placeholder="请输入转定金额"
                      style={{ width: 'calc(100% - 60px)' }}
                      min={0}
                      precision={2}
                      controls={true}
                      parser={(value) => {
                        // 只允许数字和小数点，并转换为数字
                        const cleaned = value!.replace(/[^\d.]/g, '')
                        const parsed = parseFloat(cleaned)
                        return isNaN(parsed) ? 0 : parsed
                      }}
                      onKeyPress={(e) => {
                        // 阻止非数字字符（除了小数点、退格、删除等）
                        const char = String.fromCharCode(e.which || e.keyCode)
                        if (!/[0-9.]/.test(char) && !['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) {
                          e.preventDefault()
                        }
                      }}
                    />
                    <Input
                      style={{
                        width: 60,
                        textAlign: 'center',
                        pointerEvents: 'none',
                        backgroundColor: '#fafafa',
                      }}
                      placeholder="万元"
                      value="万元"
                      readOnly
                    />
                  </Space.Compact>
                </Form.Item>
              ) : null
            }
          </Form.Item>
        </Form>
      </Modal>

      {/* 添加协同人员模态框 */}
      <Modal
        title="添加协同人员"
        open={memberModalVisible}
        onCancel={() => {
          setMemberModalVisible(false)
          memberForm.resetFields()
        }}
        onOk={() => memberForm.submit()}
        confirmLoading={addMemberMutation.isLoading}
      >
        <Form
          form={memberForm}
          onFinish={(values) => addMemberMutation.mutate({ ...values, member_id: user?.id! })}
          layout="vertical"
        >
          <Form.Item name="role" label="协同角色">
            <Input placeholder="可选：填写协同角色" />
          </Form.Item>
          <Form.Item name="description" label="协同说明">
            <TextArea rows={3} placeholder="可选：填写协同说明" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default OpportunityDetail

