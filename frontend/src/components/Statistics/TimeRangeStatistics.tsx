/**
 * 时间段趋势统计组件
 */
import { Card, Table, Space, Typography, Tag, Badge } from 'antd'
import { 
  BarChartOutlined,
  FileTextOutlined,
  SolutionOutlined,
  CalendarOutlined,
  DollarOutlined
} from '@ant-design/icons'
import { TimeRangeStatistics as TimeRangeStatisticsType } from '../../services/statistics'
import type { ColumnsType } from 'antd/es/table'
import dayjs from 'dayjs'

const { Text } = Typography

interface TimeRangeStatisticsProps {
  data: TimeRangeStatisticsType[]
  loading?: boolean
  title?: string
}

export const TimeRangeStatistics = ({ 
  data, 
  loading = false,
  title = '时间段趋势统计（最近30天）'
}: TimeRangeStatisticsProps) => {
  if (!data || data.length === 0) {
    return null
  }

  const displayData = data.slice(-30).reverse().map((stat, index) => ({
    ...stat,
    key: index,
    dateFormatted: dayjs(stat.date).format('YYYY-MM-DD'),
    dateShort: dayjs(stat.date).format('MM-DD'),
    isToday: dayjs(stat.date).isSame(dayjs(), 'day'),
    isWeekend: [0, 6].includes(dayjs(stat.date).day()),
    weekday: dayjs(stat.date).format('ddd'),
  }))

  const columns: ColumnsType<typeof displayData[0]> = [
    {
      title: '日期',
      dataIndex: 'dateShort',
      key: 'date',
      width: 120,
      fixed: 'left',
      render: (text: string, record) => (
        <Space>
          <Text strong={record.isToday} style={{ color: record.isToday ? '#1890ff' : '#262626' }}>
            {text}
          </Text>
          {record.isToday && (
            <Badge status="processing" text="今天" />
          )}
          {record.isWeekend && !record.isToday && (
            <Tag color="default" style={{ margin: 0, fontSize: '11px' }}>
              {record.weekday}
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: (
        <Space>
          <FileTextOutlined style={{ color: '#1890ff' }} />
          <span>任务</span>
        </Space>
      ),
      dataIndex: 'task_count',
      key: 'task_count',
      align: 'center',
      width: 100,
      render: (value: number) => (
        <Text strong style={{ color: value > 0 ? '#1890ff' : '#8c8c8c', fontSize: '15px' }}>
          {value}
        </Text>
      ),
      sorter: (a, b) => a.task_count - b.task_count,
    },
    {
      title: (
        <Space>
          <SolutionOutlined style={{ color: '#52c41a' }} />
          <span>工单</span>
        </Space>
      ),
      dataIndex: 'work_order_count',
      key: 'work_order_count',
      align: 'center',
      width: 100,
      render: (value: number) => (
        <Text strong style={{ color: value > 0 ? '#52c41a' : '#8c8c8c', fontSize: '15px' }}>
          {value}
        </Text>
      ),
      sorter: (a, b) => a.work_order_count - b.work_order_count,
    },
    {
      title: (
        <Space>
          <CalendarOutlined style={{ color: '#fa8c16' }} />
          <span>拜访</span>
        </Space>
      ),
      dataIndex: 'visit_log_count',
      key: 'visit_log_count',
      align: 'center',
      width: 100,
      render: (value: number) => (
        <Text strong style={{ color: value > 0 ? '#fa8c16' : '#8c8c8c', fontSize: '15px' }}>
          {value}
        </Text>
      ),
      sorter: (a, b) => a.visit_log_count - b.visit_log_count,
    },
    {
      title: (
        <Space>
          <DollarOutlined style={{ color: '#f5222d' }} />
          <span>商机</span>
        </Space>
      ),
      dataIndex: 'opportunity_count',
      key: 'opportunity_count',
      align: 'center',
      width: 100,
      render: (value: number) => (
        <Text strong style={{ color: value > 0 ? '#f5222d' : '#8c8c8c', fontSize: '15px' }}>
          {value}
        </Text>
      ),
      sorter: (a, b) => a.opportunity_count - b.opportunity_count,
    },
    {
      title: '合计',
      key: 'total',
      align: 'center',
      width: 100,
      render: (_: any, record) => {
        const total = record.task_count + record.work_order_count + record.visit_log_count + record.opportunity_count
        return (
          <Text strong style={{ fontSize: '15px', color: '#262626' }}>
            {total}
          </Text>
        )
      },
      sorter: (a, b) => {
        const totalA = a.task_count + a.work_order_count + a.visit_log_count + a.opportunity_count
        const totalB = b.task_count + b.work_order_count + b.visit_log_count + b.opportunity_count
        return totalA - totalB
      },
    },
  ]

  return (
    <Card
      title={
        <Space>
          <div
            style={{
              width: '4px',
              height: '18px',
              background: '#1890ff',
              borderRadius: '2px',
            }}
          />
          <BarChartOutlined style={{ color: '#595959', fontSize: '16px' }} />
          <Text strong style={{ fontSize: '15px', color: '#262626' }}>{title}</Text>
        </Space>
      }
      style={{
        borderRadius: '12px',
        border: '1px solid #e8e8e8',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
        marginBottom: '24px',
        background: '#ffffff',
      }}
      loading={loading}
      styles={{
        header: {
          borderBottom: '1px solid #f0f0f0',
          padding: '18px 24px',
        },
        body: { padding: '24px' }
      }}
    >
      <Table
        columns={columns}
        dataSource={displayData}
        loading={loading}
        pagination={{
          pageSize: 15,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条记录`,
          pageSizeOptions: ['10', '15', '20', '30'],
        }}
        scroll={{ x: 800 }}
        size="middle"
        rowClassName={(record) => record.isToday ? 'today-row' : ''}
        style={{
          borderRadius: '8px',
        }}
      />
      <style>{`
        .today-row {
          background-color: #f0f9ff !important;
        }
        .today-row:hover {
          background-color: #e6f7ff !important;
        }
        .ant-table-thead > tr > th {
          background-color: #fafafa;
          font-weight: 600;
        }
      `}</style>
    </Card>
  )
}

