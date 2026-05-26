/**
 * 待办事项列表页面
 */
import { useMemo, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Table,
  Tag,
  Typography,
  Space,
  Button,
  Input,
  Select,
  Form,
  Radio,
  Badge,
} from 'antd'
import type { RadioChangeEvent } from 'antd/es/radio'
import {
  FileTextOutlined,
  SolutionOutlined,
  DollarOutlined,
  ExclamationCircleOutlined,
  ClockCircleOutlined,
  UserSwitchOutlined,
  CheckCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { useQuery } from 'react-query'
import { getTodos, getTodoStatistics, TodoItem, TodoType, TodoListParams } from '../services/todo'
import { useAuth } from '../contexts/AuthContext'
import EmptyState from '../components/EmptyState'
import dayjs from 'dayjs'

const { Text, Title } = Typography
const { Option } = Select

const getTypeIcon = (type: TodoType) => {
  switch (type) {
    case 'task':
      return <FileTextOutlined style={{ color: '#1890ff', fontSize: '16px' }} />
    case 'work_order':
      return <SolutionOutlined style={{ color: '#52c41a', fontSize: '16px' }} />
    case 'opportunity':
      return <DollarOutlined style={{ color: '#fa8c16', fontSize: '16px' }} />
    case 'user':
      return <UserOutlined style={{ color: '#eb2f96', fontSize: '16px' }} />
    default:
      return <FileTextOutlined style={{ fontSize: '16px' }} />
  }
}

const getTypeLabel = (type: TodoType) => {
  switch (type) {
    case 'task':
      return '任务'
    case 'work_order':
      return '工单'
    case 'opportunity':
      return '商机'
    case 'user':
      return '用户'
    default:
      return '待办'
  }
}

const getPriorityColor = (priority: string, isOverdue: boolean) => {
  if (isOverdue) return 'red'
  switch (priority) {
    case 'high':
      return 'orange'
    case 'medium':
      return 'blue'
    case 'low':
      return 'default'
    default:
      return 'default'
  }
}

const getPriorityText = (priority: string, isOverdue: boolean) => {
  if (isOverdue) return '已逾期'
  switch (priority) {
    case 'high':
      return '高优先级'
    case 'medium':
      return '中优先级'
    case 'low':
      return '低优先级'
    default:
      return ''
  }
}

// 获取操作类型标签
const getActionTypeTag = (actionType?: 'assign' | 'accept' | 'confirm' | 'submit' | 'waiting' | 'approve' | null) => {
  switch (actionType) {
    case 'assign':
      return {
        text: '需转派',
        color: '#ff7a00',
        bgColor: '#fff7e6',
        icon: <UserSwitchOutlined style={{ fontSize: '11px' }} />,
      }
    case 'accept':
      return {
        text: '待接单',
        color: '#52c41a',
        bgColor: '#f6ffed',
        icon: <CheckCircleOutlined style={{ fontSize: '11px' }} />,
      }
    case 'confirm':
      return {
        text: '需确认',
        color: '#1890ff',
        bgColor: '#e6f7ff',
        icon: <CheckCircleOutlined style={{ fontSize: '11px' }} />,
      }
    case 'submit':
      return {
        text: '需提交',
        color: '#722ed1',
        bgColor: '#f9f0ff',
        icon: <FileTextOutlined style={{ fontSize: '11px' }} />,
      }
    case 'waiting':
      return {
        text: '等待中',
        color: '#8c8c8c',
        bgColor: '#f5f5f5',
        icon: <ClockCircleOutlined style={{ fontSize: '11px' }} />,
      }
    case 'approve':
      return {
        text: '需审核',
        color: '#eb2f96',
        bgColor: '#fff0f6',
        icon: <CheckCircleOutlined style={{ fontSize: '11px' }} />,
      }
    default:
      return null
  }
}

const TODO_TYPES: TodoType[] = ['task', 'work_order', 'opportunity', 'user']
const TODO_ACTIONS: NonNullable<TodoListParams['action_type_filter']>[] = [
  'assign',
  'accept',
  'confirm',
  'submit',
  'waiting',
  'approve',
]
const TODO_PRIORITIES: NonNullable<TodoListParams['priority_filter']>[] = ['high', 'medium', 'low']

const TodoList = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { user, getCurrentRole } = useAuth()
  const currentRole = getCurrentRole()

  const [searchForm] = Form.useForm()

  const todoFilters: TodoListParams = useMemo(() => {
    const sp = searchParams
    const typeRaw = sp.get('type') || undefined
    const type_filter = typeRaw && TODO_TYPES.includes(typeRaw as TodoType) ? (typeRaw as TodoType) : undefined
    const atRaw = sp.get('action_type') || undefined
    const action_type_filter =
      atRaw && TODO_ACTIONS.includes(atRaw as NonNullable<TodoListParams['action_type_filter']>)
        ? (atRaw as NonNullable<TodoListParams['action_type_filter']>)
        : undefined
    const prRaw = sp.get('priority') || undefined
    const priority_filter =
      prRaw && TODO_PRIORITIES.includes(prRaw as NonNullable<TodoListParams['priority_filter']>)
        ? (prRaw as NonNullable<TodoListParams['priority_filter']>)
        : undefined
    return {
      search: sp.get('search')?.trim() || undefined,
      type_filter,
      action_type_filter,
      priority_filter,
      overdue_only: sp.get('overdue_only') === 'true' ? true : undefined,
    }
  }, [searchParams])

  useEffect(() => {
    searchForm.setFieldsValue({ search: searchParams.get('search') || undefined })
  }, [searchParams, searchForm])

  const patchTodoUrl = (patch: Record<string, string | null | undefined>) => {
    const next = new URLSearchParams(searchParams)
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === undefined || v === '') next.delete(k)
      else next.set(k, v)
    }
    setSearchParams(next, { replace: true })
  }

  const { data: todos = [], isLoading, refetch } = useQuery(
    ['todos', user?.id, currentRole?.role, todoFilters],
    () => getTodos(todoFilters),
    {
      refetchInterval: 6000,
      enabled: !!user,
    }
  )

  const { data: statistics } = useQuery(
    ['todoStatistics', user?.id, currentRole?.role, todoFilters],
    () => getTodoStatistics(todoFilters),
    {
      refetchInterval: 6000,
      enabled: !!user,
    }
  )

  const handleTypeFilter = (value: string | null) => {
    patchTodoUrl({ type: value || null })
  }

  const handleActionTypeFilter = (value: string | null) => {
    patchTodoUrl({ action_type: value || null })
  }

  const handlePriorityFilter = (value: string | null) => {
    patchTodoUrl({ priority: value || null })
  }

  const handleOverdueFilter = (e: RadioChangeEvent) => {
    patchTodoUrl({ overdue_only: e.target.value === 'overdue' ? 'true' : null })
  }

  const handleSearch = (values: { search?: string }) => {
    patchTodoUrl({ search: values.search?.trim() || null })
  }

  const columns = [
    {
      title: '类型',
      key: 'type',
      width: 60,
      render: (_: any, record: TodoItem) => (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {getTypeIcon(record.type)}
        </div>
      ),
    },
    {
      title: '标题',
      key: 'title',
      ellipsis: true,
      render: (_: any, record: TodoItem) => (
        <Space direction="vertical" size={4} style={{ width: '100%' }}>
          <Space size="small" wrap>
            <Text
              strong
              style={{
                fontSize: '14px',
                color: record.isOverdue ? '#ff4d4f' : '#262626',
              }}
            >
              {record.title}
            </Text>
            {/* 操作类型标签 */}
            {getActionTypeTag(record.actionType) && (
              <Tag
                style={{
                  margin: 0,
                  fontSize: '11px',
                  padding: '1px 6px',
                  background: getActionTypeTag(record.actionType)!.bgColor,
                  color: getActionTypeTag(record.actionType)!.color,
                  border: `1px solid ${getActionTypeTag(record.actionType)!.color}`,
                  borderRadius: '3px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '3px',
                  lineHeight: '18px',
                }}
              >
                {getActionTypeTag(record.actionType)!.icon}
                {getActionTypeTag(record.actionType)!.text}
              </Tag>
            )}
            <Tag
              color={getPriorityColor(record.priority, record.isOverdue)}
              style={{ margin: 0, fontSize: '11px', padding: '1px 6px', lineHeight: '18px' }}
            >
              {getPriorityText(record.priority, record.isOverdue)}
            </Tag>
            {record.isOverdue && (
              <ExclamationCircleOutlined
                style={{ color: '#ff4d4f', fontSize: '14px' }}
              />
            )}
          </Space>
          <Text
            type="secondary"
            style={{ fontSize: '12px' }}
            ellipsis={{ tooltip: record.description }}
          >
            {record.description}
          </Text>
        </Space>
      ),
    },
    {
      title: '类型',
      key: 'type_label',
      width: 80,
      render: (_: any, record: TodoItem) => (
        <Tag
          style={{
            fontSize: '11px',
            padding: '1px 6px',
            background: '#f5f5f5',
            border: 'none',
            lineHeight: '18px',
          }}
        >
          {getTypeLabel(record.type)}
        </Tag>
      ),
    },
    {
      title: '截止时间',
      key: 'due_date',
      width: 120,
      render: (_: any, record: TodoItem) => {
        if (!record.dueDate) return '-'
        return (
          <Space size={4}>
            <ClockCircleOutlined
              style={{
                fontSize: '12px',
                color: record.isOverdue ? '#ff4d4f' : '#8c8c8c',
              }}
            />
            <Text
              type="secondary"
              style={{
                fontSize: '12px',
                color: record.isOverdue ? '#ff4d4f' : '#8c8c8c',
              }}
            >
              {record.isOverdue
                ? `逾期 ${dayjs().diff(dayjs(record.dueDate), 'day')} 天`
                : dayjs(record.dueDate).format('MM-DD')}
            </Text>
          </Space>
        )
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: any, record: TodoItem) => (
        <Button type="link" size="small" onClick={() => navigate(record.link)}>
          查看
        </Button>
      ),
    },
  ]

  return (
    <div>
      {/* 标题和操作栏 */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space size="middle">
          <Title level={3} style={{ margin: 0 }}>待办/提醒中心</Title>
          {statistics && (
            <Badge count={statistics.total} showZero>
              <span />
            </Badge>
          )}
          {statistics && statistics.overdue > 0 && (
            <Tag color="red" style={{ margin: 0, marginLeft: 8 }}>
              逾期 {statistics.overdue}
            </Tag>
          )}
          {statistics && statistics.high_priority > 0 && (
            <Tag color="orange" style={{ margin: 0, marginLeft: 8 }}>
              高优先级 {statistics.high_priority}
            </Tag>
          )}
        </Space>
        <Button
          icon={<ReloadOutlined />}
          onClick={() => refetch()}
        >
          刷新
        </Button>
      </div>

      {/* 搜索和筛选 */}
      <Form
        form={searchForm}
        layout="inline"
        onFinish={handleSearch}
        style={{ marginBottom: 16 }}
      >
        <Form.Item name="search">
          <Input
            placeholder="搜索待办事项..."
            prefix={<SearchOutlined />}
            allowClear
            style={{ width: 250 }}
          />
        </Form.Item>
        <Form.Item>
          <Select
            placeholder="类型"
            allowClear
            style={{ width: 120 }}
            value={todoFilters.type_filter}
            onChange={handleTypeFilter}
          >
            <Option value="task">任务</Option>
            <Option value="work_order">工单</Option>
            <Option value="opportunity">商机</Option>
            <Option value="user">用户</Option>
          </Select>
        </Form.Item>
        <Form.Item>
          <Select
            placeholder="操作类型"
            allowClear
            style={{ width: 120 }}
            value={todoFilters.action_type_filter}
            onChange={handleActionTypeFilter}
          >
            <Option value="assign">需转派</Option>
            <Option value="accept">待接单</Option>
            <Option value="confirm">需确认</Option>
            <Option value="submit">需提交</Option>
            <Option value="waiting">等待中</Option>
            <Option value="approve">需审核</Option>
          </Select>
        </Form.Item>
        <Form.Item>
          <Select
            placeholder="优先级"
            allowClear
            style={{ width: 100 }}
            value={todoFilters.priority_filter}
            onChange={handlePriorityFilter}
          >
            <Option value="high">高</Option>
            <Option value="medium">中</Option>
            <Option value="low">低</Option>
          </Select>
        </Form.Item>
        <Form.Item>
          <Radio.Group
            onChange={handleOverdueFilter}
            value={todoFilters.overdue_only ? 'overdue' : 'all'}
            size="small"
          >
            <Radio.Button value="all">全部</Radio.Button>
            <Radio.Button value="overdue">仅逾期</Radio.Button>
          </Radio.Group>
        </Form.Item>
        <Form.Item>
          <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
            搜索
          </Button>
        </Form.Item>
      </Form>

      {/* 待办事项表格 */}
      {!isLoading && todos.length === 0 ? (
        <EmptyState description="暂无待办事项" />
      ) : (
        <Table
          columns={columns}
          dataSource={todos}
          loading={isLoading}
          rowKey="id"
          pagination={false}
          size="middle"
          rowClassName={(record) => (record.isOverdue ? 'overdue-row' : '')}
          onRow={(record) => ({
            onClick: () => navigate(record.link),
            style: { cursor: 'pointer' },
          })}
          style={{
            backgroundColor: '#fff',
          }}
        />
      )}

      <style>{`
        .overdue-row {
          background-color: #fff1f0 !important;
        }
        .overdue-row:hover {
          background-color: #ffe7e5 !important;
        }
      `}</style>
    </div>
  )
}

export default TodoList
