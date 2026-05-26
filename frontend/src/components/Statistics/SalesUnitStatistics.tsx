/**
 * 部门数据统计组件
 */
import { Card, Row, Col, Space, Typography, Table, Tag, Statistic } from 'antd'
import { 
  BarChartOutlined,
  FileTextOutlined,
  SolutionOutlined,
  DollarOutlined,
  TrophyOutlined,
  RiseOutlined
} from '@ant-design/icons'
import { SalesUnitStatistics as SalesUnitStatisticsType } from '../../services/statistics'
import type { ColumnsType } from 'antd/es/table'

const { Text } = Typography

interface SalesUnitStatisticsProps {
  data: SalesUnitStatisticsType[]
  loading?: boolean
  title?: string
}

export const SalesUnitStatistics = ({ 
  data, 
  loading = false,
  title = '部门数据统计'
}: SalesUnitStatisticsProps) => {
  if (!data || data.length === 0) {
    return null
  }

  // 计算汇总数据
  const totalTasks = data.reduce((sum, item) => sum + item.task_count, 0)
  const totalWorkOrders = data.reduce((sum, item) => sum + item.work_order_count, 0)
  const totalOpportunities = data.reduce((sum, item) => sum + item.opportunity_count, 0)

  // 找出各项指标最高的单位
  const topTaskUnit = data.reduce((max, item) => 
    item.task_count > max.task_count ? item : max, data[0])
  const topWorkOrderUnit = data.reduce((max, item) => 
    item.work_order_count > max.work_order_count ? item : max, data[0])
  const topOpportunityUnit = data.reduce((max, item) => 
    item.opportunity_count > max.opportunity_count ? item : max, data[0])
  const topConversionUnit = data.reduce((max, item) => 
    item.conversion_rate > max.conversion_rate ? item : max, data[0])

  // 表格数据
  const tableData = data.map((item, index) => ({
    ...item,
    key: index,
    total: item.task_count + item.work_order_count + item.opportunity_count,
  }))

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
      title: '部门',
      dataIndex: 'sales_unit',
      key: 'sales_unit',
      width: 200,
      render: (text: string, record) => {
        const isTop = record.sales_unit === topTaskUnit.sales_unit || 
                     record.sales_unit === topWorkOrderUnit.sales_unit ||
                     record.sales_unit === topOpportunityUnit.sales_unit
        return (
          <Space>
            <Text strong={isTop} style={{ color: isTop ? '#1890ff' : '#262626' }}>
              {text}
            </Text>
            {isTop && <Tag color="blue">优秀</Tag>}
          </Space>
        )
      },
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
      render: (value: number, record) => (
        <Text 
          strong={record.sales_unit === topTaskUnit.sales_unit}
          style={{ 
            color: record.sales_unit === topTaskUnit.sales_unit ? '#1890ff' : '#262626',
            fontSize: '15px'
          }}
        >
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
      render: (value: number, record) => (
        <Text 
          strong={record.sales_unit === topWorkOrderUnit.sales_unit}
          style={{ 
            color: record.sales_unit === topWorkOrderUnit.sales_unit ? '#52c41a' : '#262626',
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
          <DollarOutlined style={{ color: '#fa8c16' }} />
          <span>商机</span>
        </Space>
      ),
      dataIndex: 'opportunity_count',
      key: 'opportunity_count',
      align: 'center',
      width: 100,
      render: (value: number, record) => (
        <Text 
          strong={record.sales_unit === topOpportunityUnit.sales_unit}
          style={{ 
            color: record.sales_unit === topOpportunityUnit.sales_unit ? '#fa8c16' : '#262626',
            fontSize: '15px'
          }}
        >
          {value}
        </Text>
      ),
      sorter: (a, b) => a.opportunity_count - b.opportunity_count,
    },
    {
      title: (
        <Space>
          <RiseOutlined style={{ color: '#f5222d' }} />
          <span>转化率</span>
        </Space>
      ),
      dataIndex: 'conversion_rate',
      key: 'conversion_rate',
      align: 'center',
      width: 120,
      render: (value: number, record) => (
        <Space>
          <Text 
            strong={record.sales_unit === topConversionUnit.sales_unit}
            style={{ 
              color: record.sales_unit === topConversionUnit.sales_unit ? '#f5222d' : '#262626',
              fontSize: '15px'
            }}
          >
            {value}%
          </Text>
          {value > 0 && (
            <Tag color={value >= 50 ? 'success' : value >= 20 ? 'warning' : 'default'} style={{ margin: 0 }}>
              {value >= 50 ? '优秀' : value >= 20 ? '良好' : '待提升'}
            </Tag>
          )}
        </Space>
      ),
      sorter: (a, b) => a.conversion_rate - b.conversion_rate,
    },
    {
      title: '合计',
      key: 'total',
      align: 'center',
      width: 100,
      render: (_: any, record) => (
        <Text strong style={{ fontSize: '15px', color: '#262626' }}>
          {record.total}
        </Text>
      ),
      sorter: (a, b) => a.total - b.total,
    },
  ]

  return (
    <div>
      {/* 汇总统计卡片 */}
      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="部门总数"
              value={data.length}
              prefix={<BarChartOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="总任务数"
              value={totalTasks}
              prefix={<FileTextOutlined />}
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
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic
              title="总商机数"
              value={totalOpportunities}
              prefix={<DollarOutlined />}
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
          dataSource={tableData}
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 个所属部门`,
            pageSizeOptions: ['10', '20', '50'],
          }}
          scroll={{ x: 800 }}
          size="middle"
        />
      </Card>
    </div>
  )
}

