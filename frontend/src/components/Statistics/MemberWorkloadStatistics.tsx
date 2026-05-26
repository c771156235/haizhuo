/**
 * 成员工作量统计组件
 */
import { Card, Row, Col, Space, Table, Typography, Avatar, Tag, Statistic, Progress } from 'antd'
import { 
  TeamOutlined, 
  UserOutlined,
  SolutionOutlined,
  CheckCircleOutlined,
  CalendarOutlined,
  TrophyOutlined,
  StarOutlined
} from '@ant-design/icons'
import { MemberWorkload } from '../../services/statistics'
import type { ColumnsType } from 'antd/es/table'

const { Text } = Typography

interface MemberWorkloadStatisticsProps {
  data: MemberWorkload[]
  loading?: boolean
  title?: string
}

export const MemberWorkloadStatistics = ({ 
  data, 
  loading = false,
  title = '成员工作量统计'
}: MemberWorkloadStatisticsProps) => {
  if (!data || data.length === 0) {
    return null
  }

  // 计算汇总数据
  const totalMembers = data.length
  const totalWorkOrders = data.reduce((sum, item) => sum + item.work_order_count, 0)
  const totalCompleted = data.reduce((sum, item) => sum + item.completed_work_orders, 0)
  const avgCompletionRate = totalWorkOrders > 0 
    ? Math.round((totalCompleted / totalWorkOrders) * 100)
    : 0

  // 找出各项指标最高的成员
  const topWorkOrderMember = data.reduce((max, item) => 
    item.work_order_count > max.work_order_count ? item : max, data[0])
  const topCompletedMember = data.reduce((max, item) => 
    item.completed_work_orders > max.completed_work_orders ? item : max, data[0])
  const topVisitLogMember = data.reduce((max, item) => 
    item.visit_log_count > max.visit_log_count ? item : max, data[0])

  // 计算完成率最高的成员
  const topCompletionRateMember = data.reduce((max, item) => {
    const maxRate = max.work_order_count > 0 ? (max.completed_work_orders / max.work_order_count) * 100 : 0
    const itemRate = item.work_order_count > 0 ? (item.completed_work_orders / item.work_order_count) * 100 : 0
    return itemRate > maxRate ? item : max
  }, data[0])

  // 表格数据
  const tableData = data.map((item, index) => {
    const completionRate = item.work_order_count > 0 
      ? Math.round((item.completed_work_orders / item.work_order_count) * 100)
      : 0
    return {
      ...item,
      key: index,
      completionRate,
      totalWorkload: item.work_order_count + item.visit_log_count,
    }
  })

  const columns: ColumnsType<typeof tableData[0]> = [
    {
      title: '排名',
      key: 'rank',
      width: 80,
      align: 'center',
      render: (_: any, __: any, index: number) => {
        const rank = index + 1
        if (rank === 1) return <TrophyOutlined style={{ color: '#faad14', fontSize: '18px' }} />
        if (rank === 2) return <TrophyOutlined style={{ color: '#d9d9d9', fontSize: '18px' }} />
        if (rank === 3) return <TrophyOutlined style={{ color: '#ff7a45', fontSize: '18px' }} />
        return <span style={{ color: '#8c8c8c' }}>{rank}</span>
      },
    },
    {
      title: '成员',
      dataIndex: 'member_name',
      key: 'member_name',
      width: 150,
      render: (text: string, record) => {
        const isTop = record.member_id === topWorkOrderMember.member_id || 
                     record.member_id === topCompletedMember.member_id ||
                     record.member_id === topVisitLogMember.member_id
        return (
          <Space>
            <Avatar 
              size="small" 
              icon={<UserOutlined />} 
              style={{ 
                backgroundColor: isTop ? '#1890ff' : '#d9d9d9',
                border: isTop ? '2px solid #1890ff' : 'none'
              }} 
            />
            <Text strong={isTop} style={{ color: isTop ? '#1890ff' : '#262626' }}>
              {text}
            </Text>
            {isTop && <Tag color="blue" icon={<StarOutlined />}>优秀</Tag>}
          </Space>
        )
      },
    },
    {
      title: (
        <Space>
          <SolutionOutlined style={{ color: '#1890ff' }} />
          <span>工单数</span>
        </Space>
      ),
      dataIndex: 'work_order_count',
      key: 'work_order_count',
      align: 'center',
      width: 120,
      render: (value: number, record) => (
        <Text 
          strong={record.member_id === topWorkOrderMember.member_id}
          style={{ 
            color: record.member_id === topWorkOrderMember.member_id ? '#1890ff' : '#262626',
            fontSize: '15px'
          }}
        >
          {value}
        </Text>
      ),
      sorter: (a, b) => a.work_order_count - b.work_order_count,
    },
    {
      title: (
        <Space>
          <CheckCircleOutlined style={{ color: '#52c41a' }} />
          <span>已拜访工单</span>
        </Space>
      ),
      dataIndex: 'completed_work_orders',
      key: 'completed_work_orders',
      align: 'center',
      width: 180,
      render: (value: number, record) => {
        const total = record.work_order_count || 0
        const percent = total > 0 ? Math.round((value / total) * 100) : 0
        const isTop = record.member_id === topCompletedMember.member_id
        
        return (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Text 
              strong={isTop}
              style={{ 
                color: isTop ? '#52c41a' : '#262626',
                fontSize: '15px'
              }}
            >
              {value} / {total}
            </Text>
            <Progress 
              percent={percent} 
              size="small" 
              strokeColor={percent === 100 ? '#52c41a' : percent >= 50 ? '#1890ff' : '#faad14'}
              showInfo={false}
              style={{ margin: 0 }}
            />
            <Text style={{ fontSize: '11px', color: '#8c8c8c' }}>
              {percent}%
            </Text>
          </Space>
        )
      },
      sorter: (a, b) => a.completed_work_orders - b.completed_work_orders,
    },
    {
      title: (
        <Space>
          <CalendarOutlined style={{ color: '#fa8c16' }} />
          <span>拜访日志数</span>
        </Space>
      ),
      dataIndex: 'visit_log_count',
      key: 'visit_log_count',
      align: 'center',
      width: 140,
      render: (value: number, record) => (
        <Text 
          strong={record.member_id === topVisitLogMember.member_id}
          style={{ 
            color: record.member_id === topVisitLogMember.member_id ? '#fa8c16' : '#262626',
            fontSize: '15px'
          }}
        >
          {value}
        </Text>
      ),
      sorter: (a, b) => a.visit_log_count - b.visit_log_count,
    },
    {
      title: '完成率',
      dataIndex: 'completionRate',
      key: 'completionRate',
      align: 'center',
      width: 120,
      render: (value: number, record) => {
        const isTop = record.member_id === topCompletionRateMember.member_id
        return (
          <Space>
            <Text 
              strong={isTop}
              style={{ 
                color: isTop ? '#52c41a' : '#262626',
                fontSize: '15px'
              }}
            >
              {value}%
            </Text>
            {value === 100 && (
              <Tag color="success" style={{ margin: 0 }}>完美</Tag>
            )}
            {value >= 80 && value < 100 && (
              <Tag color="processing" style={{ margin: 0 }}>优秀</Tag>
            )}
            {value >= 50 && value < 80 && (
              <Tag color="warning" style={{ margin: 0 }}>良好</Tag>
            )}
            {value < 50 && value > 0 && (
              <Tag color="default" style={{ margin: 0 }}>待提升</Tag>
            )}
          </Space>
        )
      },
      sorter: (a, b) => a.completionRate - b.completionRate,
    },
    {
      title: '总工作量',
      key: 'totalWorkload',
      align: 'center',
      width: 120,
      render: (_: any, record) => (
        <Text strong style={{ fontSize: '15px', color: '#262626' }}>
          {record.totalWorkload}
        </Text>
      ),
      sorter: (a, b) => a.totalWorkload - b.totalWorkload,
    },
  ]

  return (
    <div>
      {/* 汇总统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="成员总数"
              value={totalMembers}
              prefix={<TeamOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="总工单数"
              value={totalWorkOrders}
              prefix={<SolutionOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="已拜访工单"
              value={totalCompleted}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="平均完成率"
              value={avgCompletionRate}
              suffix="%"
              prefix={<CalendarOutlined />}
              valueStyle={{ color: '#fa8c16' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 详细统计表格 */}
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
            <TeamOutlined style={{ color: '#595959', fontSize: '16px' }} />
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
          dataSource={tableData}
          rowKey="member_id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 位成员`,
            pageSizeOptions: ['10', '20', '50'],
          }}
          scroll={{ x: 1000 }}
          size="middle"
        />
      </Card>
    </div>
  )
}

