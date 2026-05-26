/**
 * 操作日志列表页面
 */
import { useState, useEffect, useMemo } from 'react'
import type { JSX, Key } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Table, Tag, Button, Space, Form, Select, DatePicker, Alert, Typography, Popconfirm, message } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { DeleteOutlined, SearchOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { auditLogService, AuditLog, AuditAction, AuditResource, AuditActionLabels, AuditResourceLabels } from '../services/auditLog'
import { useAuth } from '../contexts/AuthContext'
import EmptyState from '../components/EmptyState'
import dayjs from 'dayjs'
import { extractErrorMessage } from '../utils/errorHandler'

const { RangePicker } = DatePicker
const { Title } = Typography

const isAuditAction = (v: string | null | undefined): v is AuditAction =>
  v != null && (Object.values(AuditAction) as string[]).includes(v)
const isAuditResource = (v: string | null | undefined): v is AuditResource =>
  v != null && (Object.values(AuditResource) as string[]).includes(v)

const AuditLogList = () => {
  const { getCurrentRole } = useAuth()
  const queryClient = useQueryClient()
  const currentRole = getCurrentRole()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([])
  const [searchForm] = Form.useForm<{
    action?: AuditAction
    resource?: AuditResource
    date_range?: [dayjs.Dayjs, dayjs.Dayjs]
  }>()

  const page = searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : 1
  const pageSize = searchParams.get('page_size') ? parseInt(searchParams.get('page_size')!, 10) : 20

  const filters = useMemo(() => {
    const f: {
      action?: AuditAction
      resource?: AuditResource
      start_date?: string
      end_date?: string
    } = {}
    const a = searchParams.get('action') || undefined
    const r = searchParams.get('resource') || undefined
    if (isAuditAction(a)) f.action = a
    if (isAuditResource(r)) f.resource = r
    const sd = searchParams.get('start_date') || undefined
    const ed = searchParams.get('end_date') || undefined
    if (sd) f.start_date = sd
    if (ed) f.end_date = ed
    return f
  }, [searchParams])

  useEffect(() => {
    const sd = searchParams.get('start_date') || undefined
    const ed = searchParams.get('end_date') || undefined
    searchForm.setFieldsValue({
      action: isAuditAction(searchParams.get('action') || undefined)
        ? (searchParams.get('action') as AuditAction)
        : undefined,
      resource: isAuditResource(searchParams.get('resource') || undefined)
        ? (searchParams.get('resource') as AuditResource)
        : undefined,
      date_range: sd && ed ? [dayjs(sd), dayjs(ed)] : undefined,
    })
  }, [searchParams, searchForm])

  const { data: auditLogsData, isLoading, error } = useQuery(
    ['auditLogs', page, pageSize, filters],
    () =>
      auditLogService.getAuditLogs({
        page,
        page_size: pageSize,
        ...filters,
      }),
    {
      enabled: currentRole?.role === 'manager',
    }
  )

  const deleteMutation = useMutation(
    async (ids: number[]) => {
      for (const id of ids) {
        await auditLogService.deleteAuditLog(id)
      }
    },
    {
      onSuccess: (_, ids) => {
        message.success(ids.length > 1 ? `已删除 ${ids.length} 条日志` : '已删除')
        setSelectedRowKeys([])
        queryClient.invalidateQueries(['auditLogs'])
      },
      onError: (err: unknown) => {
        message.error(extractErrorMessage(err, '删除失败'))
      },
    }
  )

  const auditLogs = auditLogsData?.items || []
  const total = auditLogsData?.total || 0

  const handleTableChange = (nextPage: number, nextPageSize: number) => {
    const newParams = new URLSearchParams(searchParams)
    newParams.set('page', nextPage.toString())
    newParams.set('page_size', nextPageSize.toString())
    setSearchParams(newParams, { replace: true })
  }

  const handleSearch = (values: {
    action?: AuditAction
    resource?: AuditResource
    date_range?: [dayjs.Dayjs, dayjs.Dayjs]
  }): void => {
    const newParams = new URLSearchParams()
    if (values.action) newParams.set('action', values.action)
    if (values.resource) newParams.set('resource', values.resource)
    if (values.date_range && values.date_range.length === 2) {
      newParams.set('start_date', values.date_range[0].format('YYYY-MM-DD HH:mm:ss'))
      newParams.set('end_date', values.date_range[1].format('YYYY-MM-DD HH:mm:ss'))
    }
    newParams.set('page', '1')
    newParams.set('page_size', String(pageSize))
    setSearchParams(newParams, { replace: true })
  }

  const columns: ColumnsType<AuditLog> = [
    {
      title: '操作时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '操作用户',
      key: 'user',
      width: 120,
      render: (_: any, record: AuditLog) => (
        <span>{record.user_name || record.user_username || `用户 #${record.user_id}`}</span>
      ),
    },
    {
      title: '操作类型',
      dataIndex: 'action',
      key: 'action',
      width: 100,
      render: (action: AuditAction) => (
        <Tag color="blue">{AuditActionLabels[action] || action}</Tag>
      ),
    },
    {
      title: '操作对象',
      key: 'resource',
      width: 100,
      render: (_: any, record: AuditLog) => (
        <Space>
          <Tag color="green">
            {(AuditResourceLabels as Record<string, string>)[String(record.resource)] ||
              record.resource}
          </Tag>
          {record.resource_id && (
            <span style={{ color: '#8c8c8c', fontSize: '12px' }}>#{record.resource_id}</span>
          )}
        </Space>
      ),
    },
    {
      title: '操作描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: 'IP地址',
      dataIndex: 'ip_address',
      key: 'ip_address',
      width: 130,
    },
    {
      title: '操作',
      key: 'actions',
      width: 88,
      fixed: 'right' as const,
      render: (_: any, record: AuditLog) => (
        <Popconfirm
          title="确定删除该条操作日志？"
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true, loading: deleteMutation.isLoading }}
          onConfirm={() => deleteMutation.mutate([record.id])}
        >
          <Button type="link" danger size="small">
            删除
          </Button>
        </Popconfirm>
      ),
    },
  ]

  // 如果不是总管，显示无权限提示
  if (currentRole?.role !== 'manager') {
    return (
      <Alert
        message="无权限访问"
        description="只有总管可以查看操作日志"
        type="warning"
        showIcon
        style={{ margin: '24px' }}
      />
    ) as JSX.Element
  }

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={3} style={{ margin: 0 }}>操作日志</Title>
      </div>

      {/* 搜索和筛选 */}
      <div
        style={{
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}
      >
        <Form
          form={searchForm}
          layout="inline"
          onFinish={handleSearch}
          style={{ flex: 1 }}
        >
          <Form.Item name="action">
            <Select placeholder="操作类型" allowClear style={{ width: 120 }}>
              {Object.entries(AuditActionLabels).map(([value, label]) => (
                <Select.Option key={value} value={value}>
                  {label}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="resource">
            <Select placeholder="操作对象" allowClear style={{ width: 120 }}>
              {Object.entries(AuditResourceLabels).map(([value, label]) => (
                <Select.Option key={value} value={value}>
                  {label}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="date_range">
            <RangePicker showTime format="YYYY-MM-DD HH:mm:ss" />
          </Form.Item>
        </Form>
        <Space>
          <Popconfirm
            title={`确定删除选中的 ${selectedRowKeys.length} 条操作日志？`}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true, loading: deleteMutation.isLoading }}
            disabled={selectedRowKeys.length === 0}
            onConfirm={() => deleteMutation.mutate(selectedRowKeys.map(Number))}
          >
            <Button
              danger
              icon={<DeleteOutlined />}
              disabled={selectedRowKeys.length === 0}
              loading={deleteMutation.isLoading}
            >
              批量删除
            </Button>
          </Popconfirm>
          <Button type="primary" onClick={() => searchForm.submit()} icon={<SearchOutlined />}>
            搜索
          </Button>
        </Space>
      </div>

      {error ? (
        <Alert
          message="加载失败"
          description={extractErrorMessage(error, '未知错误')}
          type="error"
          showIcon
          closable
          style={{ marginBottom: 16 }}
        />
      ) : null}

      <Table
        columns={columns}
        dataSource={auditLogs}
        loading={isLoading}
        rowKey="id"
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys),
        }}
        scroll={{ x: 1100 }}
        pagination={{
          current: page,
          pageSize: pageSize,
          total: total,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条`,
          onChange: handleTableChange,
          onShowSizeChange: handleTableChange,
        }}
        locale={{
          emptyText: (
            <EmptyState
              description="暂无操作日志"
            />
          ),
        }}
      />
    </div>
  )
}

export default AuditLogList

