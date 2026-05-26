/**
 * 转订商机总金额统计组件
 */
import { Card, Row, Col, Space, Table, Typography, Avatar, Tag, Statistic } from 'antd'
import { 
  DollarOutlined, 
  UserOutlined,
  TeamOutlined,
  TrophyOutlined,
  CheckCircleOutlined
} from '@ant-design/icons'
import { OpportunityConvertedAmountStatistics as OpportunityConvertedAmountStatisticsType } from '../../services/statistics'
import type { ColumnsType } from 'antd/es/table'

const { Text } = Typography

interface OpportunityConvertedAmountStatisticsProps {
  data: OpportunityConvertedAmountStatisticsType[]
  loading?: boolean
  title?: string
}

export const OpportunityConvertedAmountStatistics = ({ 
  data, 
  loading = false,
  title = '转订商机总金额统计'
}: OpportunityConvertedAmountStatisticsProps) => {
  if (!data || data.length === 0) {
    return null
  }

  // 计算汇总数据
  const totalConvertedCount = data.reduce((sum, item) => sum + item.converted_count, 0)
  const totalAmount = data.reduce((sum, item) => sum + item.total_amount, 0)
  const avgAmount = totalConvertedCount > 0 
    ? Math.round(totalAmount / totalConvertedCount)
    : 0

  // 找出金额最高的项
  const topAmountItem = data.reduce((max, item) => 
    item.total_amount > max.total_amount ? item : max, data[0])

  // 格式化金额显示（单位：元）
  const formatAmount = (amount: number) => {
    if (amount >= 100000000) {
      return `${(amount / 100000000).toFixed(2)}亿`
    } else if (amount >= 10000) {
      return `${(amount / 10000).toFixed(2)}万`
    } else {
      return amount.toFixed(2)
    }
  }

  // 表格数据
  const tableData = data.map((item, index) => {
    return {
      ...item,
      key: index,
      displayName: item.member_name || item.group_name || '未知',
      isTotal: item.member_name === '组总计' || item.group_name === '总计',
    }
  })

  const columns: ColumnsType<typeof tableData[0]> = [
    {
      title: '序号',
      key: 'index',
      width: 80,
      align: 'center',
      render: (_: any, __: any, index: number) => {
        const rank = index + 1
        if (rank === 1 && !tableData[index].isTotal) {
          return <TrophyOutlined style={{ color: '#faad14', fontSize: '18px' }} />
        }
        return <span style={{ color: '#8c8c8c' }}>{rank}</span>
      },
    },
    {
      title: '名称',
      dataIndex: 'displayName',
      key: 'displayName',
      width: 200,
      render: (text: string, record) => {
        const isTop = !record.isTotal && record.total_amount === topAmountItem.total_amount
        return (
          <Space>
            <Avatar 
              size="small" 
              icon={record.member_id ? <UserOutlined /> : <TeamOutlined />} 
              style={{ 
                backgroundColor: isTop ? '#1890ff' : record.isTotal ? '#52c41a' : '#d9d9d9',
                border: isTop ? '2px solid #1890ff' : 'none'
              }} 
            />
            <Text 
              strong={isTop || record.isTotal} 
              style={{ 
                color: isTop ? '#1890ff' : record.isTotal ? '#52c41a' : '#262626',
                fontSize: record.isTotal ? '16px' : '14px'
              }}
            >
              {text}
            </Text>
            {isTop && !record.isTotal && <Tag color="blue">最高</Tag>}
            {record.isTotal && <Tag color="success">总计</Tag>}
          </Space>
        )
      },
    },
    {
      title: (
        <Space>
          <CheckCircleOutlined style={{ color: '#52c41a' }} />
          <span>转订商机数</span>
        </Space>
      ),
      dataIndex: 'converted_count',
      key: 'converted_count',
      align: 'center',
      width: 150,
      render: (value: number, record) => (
        <Text 
          strong={record.isTotal}
          style={{ 
            color: record.isTotal ? '#52c41a' : '#262626',
            fontSize: record.isTotal ? '16px' : '14px'
          }}
        >
          {value}
        </Text>
      ),
      sorter: (a, b) => a.converted_count - b.converted_count,
    },
    {
      title: (
        <Space>
          <DollarOutlined style={{ color: '#faad14' }} />
          <span>转订总金额（万元）</span>
        </Space>
      ),
      dataIndex: 'total_amount',
      key: 'total_amount',
      align: 'right',
      width: 200,
      render: (value: number, record) => {
        const isTop = !record.isTotal && record.total_amount === topAmountItem.total_amount
        return (
          <Text 
            strong={isTop || record.isTotal}
            style={{ 
              color: isTop ? '#1890ff' : record.isTotal ? '#52c41a' : '#262626',
              fontSize: record.isTotal ? '18px' : '15px'
            }}
          >
            {formatAmount(value)}
          </Text>
        )
      },
      sorter: (a, b) => a.total_amount - b.total_amount,
    },
    {
      title: '平均金额（万元）',
      key: 'avgAmount',
      align: 'right',
      width: 150,
      render: (_: any, record) => {
        const avg = record.converted_count > 0 
          ? Math.round(record.total_amount / record.converted_count)
          : 0
        return (
          <Text style={{ fontSize: '14px', color: '#595959' }}>
            {formatAmount(avg)}
          </Text>
        )
      },
    },
  ]

  return (
    <div>
      {/* 汇总统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="转订商机总数"
              value={totalConvertedCount}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="转订总金额"
              value={formatAmount(totalAmount)}
              prefix={<DollarOutlined />}
              valueStyle={{ color: '#faad14', fontSize: '20px' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="平均金额"
              value={formatAmount(avgAmount)}
              prefix={<DollarOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="统计项数"
              value={data.length}
              prefix={<TeamOutlined />}
              valueStyle={{ color: '#722ed1' }}
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
                background: '#faad14',
                borderRadius: '2px',
              }}
            />
            <DollarOutlined style={{ color: '#595959', fontSize: '16px' }} />
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
          rowKey={(record) => `${record.member_id || record.group_id || 'total'}-${record.key}`}
          loading={loading}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 项统计`,
            pageSizeOptions: ['10', '20', '50', '100'],
          }}
          scroll={{ x: 800 }}
          size="middle"
        />
      </Card>
    </div>
  )
}

