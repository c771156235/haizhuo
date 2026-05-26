/**
 * 工单详情页面
 */
import { useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { Card, Descriptions, Tag, Button, Result, Space, Modal, Form, message, Input, Select } from 'antd'
import { workOrderService, type WorkOrder } from '../services/workOrder'
import { useAuth } from '../contexts/AuthContext'
import { UserRole } from '../types/user'
import UserSelector from '../components/UserSelector'
import GroupMemberSelector from '../components/GroupMemberSelector'
import WorkOrderIntraGroupMemberSelect from '../components/WorkOrderIntraGroupMemberSelect'
import Loading from '../components/Loading'
import ErrorBoundary from '../components/ErrorBoundary'
import { PageBreadcrumb } from '../components/PageBreadcrumb'
import dayjs from 'dayjs'
import { extractErrorMessage } from '../utils/errorHandler'
import { getWorkOrderStatusDisplay } from '../utils/workOrderStatusDisplay'

const WorkOrderDetail = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { user, getCurrentRole } = useAuth()
  const currentRole = getCurrentRole()
  const queryClient = useQueryClient()

  /** 与 useQuery 完全一致，避免 invalidate 时用错 key（数字 vs 字符串）导致认领后不刷新 */
  const workOrderQueryKey = ['workOrder', id] as const
  
  // 从 location 获取来源页面的查询参数（分页信息）
  const getReturnUrl = () => {
    const searchParams = new URLSearchParams(location.search)
    // 如果有查询参数，返回时带上这些参数
    if (searchParams.toString()) {
      return `/work-orders?${searchParams.toString()}`
    }
    return '/work-orders'
  }
  const [assignModalVisible, setAssignModalVisible] = useState(false)
  const [assignForm] = Form.useForm()
  const [transferModalVisible, setTransferModalVisible] = useState(false)
  const [transferForm] = Form.useForm()
  const [updateTeamLeaderModalVisible, setUpdateTeamLeaderModalVisible] = useState(false)
  const [updateTeamLeaderForm] = Form.useForm()
  const [cancelModalVisible, setCancelModalVisible] = useState(false)
  const [cancelForm] = Form.useForm()

  const { data: workOrder, isLoading, error, refetch } = useQuery(
    workOrderQueryKey,
    () => workOrderService.getWorkOrder(Number(id!)),
    { enabled: !!id }
  )

  // 接单 mutation
  const acceptMutation = useMutation(
    (id: number) => workOrderService.acceptWorkOrder(id),
    {
      onSuccess: () => {
        message.success('接单成功')
        queryClient.invalidateQueries(workOrderQueryKey)
        queryClient.invalidateQueries('workOrders')
        queryClient.invalidateQueries('notificationUnreadCount')
        queryClient.invalidateQueries('notificationsRecent')
      },
      onError: (error: any) => {
        message.error(extractErrorMessage(error, '接单失败'))
      },
    }
  )

  // 认领 mutation
  const claimMutation = useMutation(
    (workOrderId: number) => workOrderService.claimWorkOrder(workOrderId),
    {
      onSuccess: (updated: WorkOrder) => {
        message.success('认领成功，请转派给成员')
        queryClient.setQueryData(workOrderQueryKey, updated)
        queryClient.invalidateQueries(workOrderQueryKey)
        queryClient.invalidateQueries('workOrders')
        queryClient.invalidateQueries('notificationUnreadCount')
        queryClient.invalidateQueries('notificationsRecent')
        assignForm.resetFields()
        setAssignModalVisible(true)
      },
      onError: (error: any) => {
        message.error(extractErrorMessage(error, '认领失败'))
      },
    }
  )

  // 转派 mutation
  const assignMutation = useMutation(
    ({ id, member_id }: { id: number; member_id: number }) =>
      workOrderService.assignWorkOrder(id, { member_id }),
    {
      onSuccess: () => {
        message.success('转派成功')
        setAssignModalVisible(false)
        assignForm.resetFields()
        queryClient.invalidateQueries(workOrderQueryKey)
        queryClient.invalidateQueries('workOrders')
        queryClient.invalidateQueries('notificationUnreadCount')
        queryClient.invalidateQueries('notificationsRecent')
      },
      onError: (error: any) => {
        message.error(extractErrorMessage(error, '转派失败'))
      },
    }
  )

  // 修改组长 mutation
  const updateTeamLeaderMutation = useMutation(
    ({ id, data }: { id: number; data: { team_leader_id: number; reason?: string } }) =>
      workOrderService.updateWorkOrderTeamLeader(id, data),
    {
      onSuccess: () => {
        message.success('修改组长成功')
        setUpdateTeamLeaderModalVisible(false)
        updateTeamLeaderForm.resetFields()
        queryClient.invalidateQueries(workOrderQueryKey)
        queryClient.invalidateQueries('workOrders')
        queryClient.invalidateQueries('notificationUnreadCount')
        queryClient.invalidateQueries('notificationsRecent')
      },
      onError: (error: any) => {
        message.error(extractErrorMessage(error, '修改组长失败'))
      },
    }
  )

  // 取消工单 mutation
  const cancelMutation = useMutation(
    ({ id, data }: { id: number; data: { cancellation_reason?: string } }) =>
      workOrderService.cancelWorkOrder(id, data),
    {
      onSuccess: () => {
        message.success('工单已取消')
        setCancelModalVisible(false)
        cancelForm.resetFields()
        queryClient.invalidateQueries(workOrderQueryKey)
        queryClient.invalidateQueries('workOrders')
        queryClient.invalidateQueries('notificationUnreadCount')
        queryClient.invalidateQueries('notificationsRecent')
      },
      onError: (error: any) => {
        message.error(extractErrorMessage(error, '取消工单失败'))
      },
    }
  )

  // 撤回工单 mutation
  const revokeMutation = useMutation(
    (id: number) => workOrderService.revokeWorkOrder(id),
    {
      onSuccess: () => {
        message.success('工单已撤回')
        queryClient.invalidateQueries(workOrderQueryKey)
        queryClient.invalidateQueries('workOrders')
        queryClient.invalidateQueries('notificationUnreadCount')
        queryClient.invalidateQueries('notificationsRecent')
      },
      onError: (error: any) => {
        message.error(extractErrorMessage(error, '撤回工单失败'))
      },
    }
  )

  const transferMutation = useMutation(
    ({ id, data }: { id: number; data: { target_type: 'member' | 'team_leader'; target_user_id: number; reason?: string } }) =>
      workOrderService.transferWorkOrder(id, data),
    {
      onSuccess: () => {
        message.success('转单成功')
        setTransferModalVisible(false)
        transferForm.resetFields()
        queryClient.invalidateQueries(workOrderQueryKey)
        queryClient.invalidateQueries('workOrders')
        queryClient.invalidateQueries('notificationUnreadCount')
        queryClient.invalidateQueries('notificationsRecent')
      },
      onError: (error: any) => {
        message.error(extractErrorMessage(error, '转单失败'))
      },
    }
  )

  // 是否可接单：成员角色，工单状态为 pending_accept，且 member_id 为当前用户
  const canAccept = 
    currentRole?.role === UserRole.MEMBER &&
    workOrder?.status === 'pending_accept' &&
    workOrder?.member_id === user?.id

  // 是否可认领：组长角色，待组内认领（派单至组，尚未指定组长）
  const canClaim =
    currentRole?.role === UserRole.TEAM_LEADER &&
    workOrder?.status === 'pending_group_claim'

  // 是否可转派：组长角色，工单状态为 pending_assign，且 team_leader_id 为当前用户
  const canAssign = 
    currentRole?.role === UserRole.TEAM_LEADER &&
    workOrder?.status === 'pending_assign' &&
    workOrder?.team_leader_id === user?.id

  // 拜访完成：成员 + 已接单 → 跳转添加拜访日志
  const canVisitComplete =
    workOrder &&
    workOrder.status === 'accepted' &&
    currentRole?.role === UserRole.MEMBER &&
    workOrder.member_id === user?.id

  const canTransfer =
    workOrder &&
    workOrder.status === 'accepted' &&
    currentRole?.role === UserRole.MEMBER &&
    workOrder.member_id === user?.id

  // 是否可修改组长：总监角色，工单状态为 pending_assign、pending_accept 或 accepted
  // 禁止在 in_progress、completed、cancelled 状态时修改
  const canUpdateTeamLeader = 
    currentRole?.role === UserRole.MANAGER &&
    workOrder &&
    (workOrder.status === 'pending_group_claim' ||
     workOrder.status === 'pending_assign' || 
     workOrder.status === 'pending_accept' || 
     workOrder.status === 'accepted')

  // 判断是否可以撤回工单：组长角色、状态为 pending_accept/accepted、且有成员
  const canRevoke =
    currentRole?.role === UserRole.TEAM_LEADER &&
    workOrder &&
    (workOrder.status === 'pending_accept' || workOrder.status === 'accepted') &&
    workOrder.team_leader_id === user?.id &&
    workOrder.member_id

  // 是否可取消工单：
  // 1. 组长角色：工单状态为 pending_assign 或 pending_accept，且 team_leader_id 为当前用户
  // 2. 成员角色：工单状态为 pending_accept、accepted 或 in_progress，且 member_id 为当前用户
  const canCancel = 
    workOrder &&
    workOrder.status !== 'cancelled' &&
    workOrder.status !== 'completed' &&
    (
      (currentRole?.role === UserRole.TEAM_LEADER && 
       (workOrder.status === 'pending_group_claim' ||
        workOrder.status === 'pending_assign' ||
        workOrder.status === 'pending_accept') &&
       (workOrder.status === 'pending_group_claim' ? true : workOrder.team_leader_id === user?.id)) ||
      (currentRole?.role === UserRole.MEMBER && 
       (workOrder.status === 'pending_accept' || workOrder.status === 'accepted' || workOrder.status === 'in_progress') &&
       workOrder.member_id === user?.id)
    )

  const handleAccept = () => {
    if (workOrder) {
      acceptMutation.mutate(workOrder.id)
    }
  }

  const handleClaim = () => {
    if (workOrder) {
      claimMutation.mutate(workOrder.id)
    }
  }

  const handleAssign = () => {
    setAssignModalVisible(true)
  }

  const handleVisitComplete = () => {
    if (!workOrder) return
    const params = new URLSearchParams(location.search)
    navigate(`/visit-logs/create?work_order_id=${workOrder.id}`, {
      state: { returnUrl: `/work-orders/${workOrder.id}?${params.toString()}` },
    })
  }

  const handleUpdateTeamLeader = () => {
    setUpdateTeamLeaderModalVisible(true)
    // 设置默认值为当前组长
    updateTeamLeaderForm.setFieldsValue({
      team_leader_id: workOrder?.team_leader_id,
      reason: '',
    })
  }

  const handleTransfer = () => {
    setTransferModalVisible(true)
    transferForm.setFieldsValue({
      target_type: 'member',
      target_user_id: undefined,
      reason: '',
    })
  }

  const handleCancel = () => {
    setCancelModalVisible(true)
    cancelForm.resetFields()
  }

  const handleRevoke = () => {
    if (workOrder) {
      Modal.confirm({
        title: '确认撤回工单',
        content: (
          <div>
            <p>确定要撤回此工单的转派吗？撤回后：</p>
            <ul style={{ marginTop: 8, paddingLeft: 20 }}>
              <li>工单将重置为「待转派」状态</li>
              <li>成员关系将被清空</li>
              <li>原成员将收到撤回通知</li>
              {workOrder.status === 'accepted' && (
                <li style={{ color: '#ff4d4f' }}>
                  <strong>注意：</strong>成员已接单，撤回后将清空接单记录
                </li>
              )}
            </ul>
          </div>
        ),
        okText: '确认撤回',
        cancelText: '取消',
        okButtonProps: { danger: true },
        onOk: () => {
          revokeMutation.mutate(workOrder.id)
        },
      })
    }
  }

  if (isLoading) {
    return <Loading tip="加载工单详情..." />
  }

  if (error) {
    return <ErrorBoundary error={error as Error} onRetry={() => refetch()} title="加载工单失败" />
  }

  if (!workOrder) {
    return (
      <Result
        status="404"
        title="404"
        subTitle="工单不存在"
        extra={
          <Button type="primary" onClick={() => navigate(getReturnUrl())}>
            返回工单列表
          </Button>
        }
      />
    )
  }

  return (
    <div>
      <PageBreadcrumb
        items={[
          { title: '工单管理', to: getReturnUrl() },
          { title: workOrder.work_order_no || '工单详情' },
        ]}
      />

      <Card title="工单详情">
        <Descriptions column={2} bordered>
          <Descriptions.Item label="工单编号">{workOrder.work_order_no}</Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag color={getWorkOrderStatusDisplay(workOrder.status).color}>
              {getWorkOrderStatusDisplay(workOrder.status).label}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="任务">
            {workOrder.task_name ? (
              <Space>
                <Button 
                  type="link" 
                  style={{ padding: 0 }}
                  onClick={() => navigate(`/tasks/${workOrder.task_id}`)}
                >
                  {workOrder.task_name}
                </Button>
                {workOrder.task_sales_unit && (
                  <span style={{ color: '#8c8c8c' }}>({workOrder.task_sales_unit})</span>
                )}
              </Space>
            ) : (
              <span>任务 #{workOrder.task_id}</span>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="组长">
            {workOrder.team_leader_name ? (
              <span>{workOrder.team_leader_name}</span>
            ) : workOrder.team_leader_id ? (
              <span>用户 #{workOrder.team_leader_id}</span>
            ) : (
              <span style={{ color: '#8c8c8c' }}>待组内认领</span>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="组别">
            {workOrder.group_name || '-'}
          </Descriptions.Item>
          {workOrder.member_id ? (
            <Descriptions.Item label="成员">
              {workOrder.member_name ? (
                <span>{workOrder.member_name}</span>
              ) : (
                <span>用户 #{workOrder.member_id}</span>
              )}
            </Descriptions.Item>
          ) : null}
          <Descriptions.Item label="创建时间" span={workOrder.member_id ? 1 : 2}>
            {dayjs(workOrder.created_at).format('YYYY-MM-DD HH:mm:ss')}
          </Descriptions.Item>
          
          {/* 详细需求信息*/}
          {workOrder.detail_requirement_id && (
            <>
              <Descriptions.Item label="客户单位" span={2}>
                {workOrder.customer_unit || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="行业类型">
                {workOrder.industry_type || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="客户来源">
                {workOrder.customer_source || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="预期拜访时间">
                {workOrder.expected_visit_time 
                  ? dayjs(workOrder.expected_visit_time).format('YYYY-MM-DD HH:mm')
                  : '-'}
              </Descriptions.Item>
              <Descriptions.Item label="客户拜访地址" span={2}>
                {workOrder.customer_visit_address || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="客户经理姓名">
                {workOrder.customer_manager_name || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="客户经理联系方式">
                {workOrder.customer_manager_contact || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="提交人" span={2}>
                {workOrder.sales_contact_name || '-'}
                {workOrder.sales_contact_unit && (
                  <span style={{ color: '#8c8c8c', marginLeft: 8 }}>
                    ({workOrder.sales_contact_unit})
                  </span>
                )}
              </Descriptions.Item>
              <Descriptions.Item label="详细需求内容" span={2}>
                <div style={{ 
                  whiteSpace: 'pre-wrap', 
                  wordBreak: 'break-word',
                  maxHeight: '200px',
                  overflowY: 'auto',
                  padding: '8px',
                  backgroundColor: '#f5f5f5',
                  borderRadius: '4px'
                }}>
                  {workOrder.requirement_content || '-'}
                </div>
              </Descriptions.Item>
            </>
          )}
          {workOrder.accepted_at && (
            <Descriptions.Item label="接单时间" span={2}>
              {dayjs(workOrder.accepted_at).format('YYYY-MM-DD HH:mm:ss')}
            </Descriptions.Item>
          )}
          {workOrder.completed_at && (
            <Descriptions.Item label="已拜访时间" span={2}>
              {dayjs(workOrder.completed_at).format('YYYY-MM-DD HH:mm:ss')}
            </Descriptions.Item>
          )}
          {workOrder.cancelled_at && (
            <Descriptions.Item label="取消时间" span={2}>
              {dayjs(workOrder.cancelled_at).format('YYYY-MM-DD HH:mm:ss')}
            </Descriptions.Item>
          )}
          {workOrder.cancellation_reason && (
            <Descriptions.Item label="取消原因" span={2}>
              <div style={{
                padding: '8px',
                backgroundColor: '#fff7e6',
                borderRadius: '4px',
                border: '1px solid #ffe58f'
              }}>
                {workOrder.cancellation_reason}
              </div>
            </Descriptions.Item>
          )}
        </Descriptions>

        {/* 操作按钮 */}
        {(canAccept ||
          canClaim ||
          canAssign ||
          canTransfer ||
          canVisitComplete ||
          canCancel ||
          canUpdateTeamLeader ||
          canRevoke) && (
          <div style={{ marginTop: 24 }}>
            <Space>
              {canClaim && (
                <Button type="primary" onClick={handleClaim} loading={claimMutation.isLoading}>
                  认领工单
                </Button>
              )}
              {canAccept && (
                <Button type="primary" onClick={handleAccept} loading={acceptMutation.isLoading}>
                  接单
                </Button>
              )}
              {canAssign && (
                <Button type="primary" onClick={handleAssign} loading={assignMutation.isLoading}>
                  {workOrder?.member_id ? '重新转派' : '转派'}
                </Button>
              )}
              {canTransfer && (
                <Button type="default" onClick={handleTransfer} loading={transferMutation.isLoading}>
                  转单
                </Button>
              )}
              {canRevoke && (
                <Button 
                  type="default" 
                  danger
                  onClick={handleRevoke} 
                  loading={revokeMutation.isLoading}
                >
                  撤回
                </Button>
              )}
              {canUpdateTeamLeader && (
                <Button type="default" onClick={handleUpdateTeamLeader}>
                  修改组长
                </Button>
              )}
              {canCancel && (
                <Button 
                  type="default" 
                  danger
                  onClick={handleCancel} 
                  loading={cancelMutation.isLoading}
                >
                  取消工单
                </Button>
              )}
              {canVisitComplete && (
                <Button type="primary" onClick={handleVisitComplete}>
                  拜访完成
                </Button>
              )}
            </Space>
          </div>
        )}
      </Card>

      {/* 转派弹窗 */}
      <Modal
        title="转派工单给成员"
        open={assignModalVisible}
        onCancel={() => {
          setAssignModalVisible(false)
          assignForm.resetFields()
        }}
        onOk={() => assignForm.submit()}
        confirmLoading={assignMutation.isLoading}
      >
        <Form
          form={assignForm}
          onFinish={(values) => {
            if (workOrder) {
              assignMutation.mutate({ id: workOrder.id, member_id: values.member_id })
            }
          }}
          layout="vertical"
        >
          <Form.Item
            name="member_id"
            label="选择成员"
            rules={[{ required: true, message: '请选择成员' }]}
            initialValue={workOrder?.member_id}
          >
            {currentRole?.role === UserRole.TEAM_LEADER ? (
              <GroupMemberSelector placeholder="请选择组内成员" />
            ) : (
              <UserSelector role={UserRole.MEMBER} placeholder="请选择成员" />
            )}
          </Form.Item>
        </Form>
      </Modal>

      {/* 修改组长弹窗 */}
      <Modal
        title="修改工单组长"
        open={updateTeamLeaderModalVisible}
        onCancel={() => {
          setUpdateTeamLeaderModalVisible(false)
          updateTeamLeaderForm.resetFields()
        }}
        onOk={() => updateTeamLeaderForm.submit()}
        confirmLoading={updateTeamLeaderMutation.isLoading}
      >
        <Form
          form={updateTeamLeaderForm}
          onFinish={(values) => {
            if (workOrder) {
              updateTeamLeaderMutation.mutate({
                id: workOrder.id,
                data: {
                  team_leader_id: values.team_leader_id,
                  reason: values.reason || undefined,
                },
              })
            }
          }}
          layout="vertical"
        >
          <Form.Item label="褰撳墠组长">
            <span>{workOrder?.team_leader_name || `用户 #${workOrder?.team_leader_id}`}</span>
          </Form.Item>
          {workOrder?.member_name && (
            <Form.Item label="褰撳墠成员">
              <span>{workOrder.member_name}</span>
            </Form.Item>
          )}
          <Form.Item
            name="team_leader_id"
            label="选择新组长"
            rules={[{ required: true, message: '请选择新组长' }]}
          >
            <UserSelector role={UserRole.TEAM_LEADER} placeholder="请选择新组长" />
          </Form.Item>
          <Form.Item
            name="reason"
            label="修改原因（可选）"
          >
            <Input.TextArea
              rows={3}
              placeholder="请输入修改原因，便于追溯"
              maxLength={500}
              showCount
            />
          </Form.Item>
          {(workOrder?.status === 'pending_accept' || workOrder?.status === 'accepted') && (
            <div style={{ 
              color: '#ff4d4f', 
              marginTop: 8,
              padding: '8px 12px',
              backgroundColor: '#fff2e8',
              borderRadius: '4px',
              border: '1px solid #ffbb96'
            }}>
              <strong>重要提示：</strong>
              <p style={{ margin: '4px 0 0 0' }}>
                当前工单已{workOrder?.status === 'pending_accept' ? '转派给成员' : '被成员接单'}，修改组长后将：
              </p>
              <ul style={{ margin: '4px 0 0 0', paddingLeft: '20px' }}>
                <li>清空成员关系</li>
                <li>重置工单状态为「待转派」</li>
                <li>新组长需重新转派给成员</li>
              </ul>
            </div>
          )}
        </Form>
      </Modal>

      {/* 成员转单弹窗 */}
      <Modal
        title="转单"
        open={transferModalVisible}
        onCancel={() => {
          setTransferModalVisible(false)
          transferForm.resetFields()
        }}
        onOk={() => transferForm.submit()}
        confirmLoading={transferMutation.isLoading}
      >
        <Form
          form={transferForm}
          layout="vertical"
          initialValues={{ target_type: 'member' }}
          onFinish={(values) => {
            if (!workOrder) return
            transferMutation.mutate({
              id: workOrder.id,
              data: {
                target_type: values.target_type,
                target_user_id: values.target_user_id,
                reason: values.reason || undefined,
              },
            })
          }}
        >
          <Form.Item
            name="target_type"
            label="转单类型"
            rules={[{ required: true, message: '请选择转单类型' }]}
          >
            <Select
              options={[
                { label: '转给组内成员', value: 'member' },
                { label: '跨组转给组长', value: 'team_leader' },
              ]}
              onChange={() => transferForm.setFieldsValue({ target_user_id: undefined })}
            />
          </Form.Item>

          <Form.Item shouldUpdate noStyle>
            {() => {
              const targetType = transferForm.getFieldValue('target_type') as 'member' | 'team_leader'
              return (
                <Form.Item
                  name="target_user_id"
                  label={targetType === 'team_leader' ? '目标组长' : '目标成员'}
                  rules={[{ required: true, message: targetType === 'team_leader' ? '请选择目标组长' : '请选择目标成员' }]}
                >
                  {targetType === 'team_leader' ? (
                    <UserSelector role={UserRole.TEAM_LEADER} placeholder="请选择目标组长" />
                  ) : (
                    <WorkOrderIntraGroupMemberSelect
                      workOrderId={workOrder?.id}
                      placeholder="请选择组内成员"
                    />
                  )}
                </Form.Item>
              )
            }}
          </Form.Item>

          <Form.Item name="reason" label="转单原因（可选）">
            <Input.TextArea rows={3} maxLength={500} showCount placeholder="请输入转单原因，便于追溯" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 取消工单弹窗 */}
      <Modal
        title="取消工单"
        open={cancelModalVisible}
        onCancel={() => {
          setCancelModalVisible(false)
          cancelForm.resetFields()
        }}
        onOk={() => cancelForm.submit()}
        confirmLoading={cancelMutation.isLoading}
        okText="确认取消"
        cancelText="取消"
        okButtonProps={{ danger: true }}
      >
        <Form
          form={cancelForm}
          onFinish={(values) => {
            if (workOrder) {
              cancelMutation.mutate({
                id: workOrder.id,
                data: {
                  cancellation_reason: values.cancellation_reason || undefined,
                },
              })
            }
          }}
          layout="vertical"
        >
          <Form.Item
            name="cancellation_reason"
            label="取消原因（可选）"
            help="填写取消原因有助于追溯和分析，建议填写"
          >
            <Input.TextArea
              rows={4}
              placeholder="请输入取消原因，例如：客户需求变更、时间冲突等"
              maxLength={500}
              showCount
            />
          </Form.Item>
          <div style={{ color: '#ff4d4f', marginTop: 8 }}>
            <strong>注意：</strong>取消后的工单无法继续操作，请确认后再提交。          </div>
        </Form>
      </Modal>
    </div>
  )
}

export default WorkOrderDetail


