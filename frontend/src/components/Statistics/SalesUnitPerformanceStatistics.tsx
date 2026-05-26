/**
 * 销售单位绩效统计组件
 */
import { Card, Table, Typography, Space, Spin, Empty } from 'antd'
import { 
  BarChartOutlined,
  UserOutlined
} from '@ant-design/icons'
import { 
  SalesUnitPerformanceStatistics as SalesUnitPerformanceStatisticsType,
  MemberDetailStatistics
} from '../../services/statistics'
import type { ColumnsType } from 'antd/es/table'

const { Text } = Typography

interface SalesUnitPerformanceStatisticsProps {
  data: SalesUnitPerformanceStatisticsType[]
  memberDetails?: MemberDetailStatistics[]
  loading?: boolean
  title?: string
}

export const SalesUnitPerformanceStatistics = ({ 
  data, 
  memberDetails,
  loading = false,
  title = '销售单位绩效统计'
}: SalesUnitPerformanceStatisticsProps) => {
  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!data || data.length === 0) {
    return <Empty description="暂无统计数据" />
  }

  // 表格列定义
  const columns: ColumnsType<SalesUnitPerformanceStatisticsType> = [
    {
      title: '客户来源',
      dataIndex: 'sales_unit',
      key: 'sales_unit',
      width: 150,
      fixed: 'left',
      render: (text: string, record) => (
        <Text strong={record.sales_unit === '总计'} style={{ 
          color: record.sales_unit === '总计' ? '#1890ff' : '#262626',
          fontSize: record.sales_unit === '总计' ? '15px' : '14px'
        }}>
          {text}
        </Text>
      ),
    },
    {
      title: '已预约',
      dataIndex: 'appointments_made',
      key: 'appointments_made',
      align: 'center',
      width: 100,
      render: (value: number) => (
        <Text style={{ fontSize: '14px' }}>{value}</Text>
      ),
    },
    {
      title: '已拜访',
      dataIndex: 'visits_completed',
      key: 'visits_completed',
      align: 'center',
      width: 100,
      render: (value: number) => (
        <Text style={{ fontSize: '14px' }}>{value}</Text>
      ),
    },
    {
      title: '有效预约率',
      dataIndex: 'effective_appointment_rate',
      key: 'effective_appointment_rate',
      align: 'center',
      width: 120,
      render: (value: number) => (
        <Text style={{ fontSize: '14px' }}>{value.toFixed(2)}%</Text>
      ),
    },
    {
      title: '有拜访对象权限',
      dataIndex: 'has_decision_authority',
      key: 'has_decision_authority',
      align: 'center',
      width: 140,
      render: (value: number) => (
        <Text style={{ fontSize: '14px' }}>{value}</Text>
      ),
    },
    {
      title: '有效拜访率',
      dataIndex: 'effective_visit_rate',
      key: 'effective_visit_rate',
      align: 'center',
      width: 120,
      render: (value: number) => (
        <Text style={{ fontSize: '14px' }}>{value.toFixed(2)}%</Text>
      ),
    },
    {
      title: '线索数量',
      dataIndex: 'lead_count',
      key: 'lead_count',
      align: 'center',
      width: 100,
      render: (value: number) => (
        <Text style={{ fontSize: '14px' }}>{value}</Text>
      ),
    },
    {
      title: '商机数量',
      dataIndex: 'opportunity_count',
      key: 'opportunity_count',
      align: 'center',
      width: 100,
      render: (value: number) => (
        <Text style={{ fontSize: '14px' }}>{value}</Text>
      ),
    },
    {
      title: '线索挖掘率',
      dataIndex: 'lead_mining_rate',
      key: 'lead_mining_rate',
      align: 'center',
      width: 120,
      render: (value: number) => (
        <Text style={{ fontSize: '14px' }}>{value.toFixed(2)}%</Text>
      ),
    },
    {
      title: '线索转化率',
      dataIndex: 'lead_conversion_rate',
      key: 'lead_conversion_rate',
      align: 'center',
      width: 120,
      render: (value: number) => (
        <Text style={{ fontSize: '14px' }}>{value.toFixed(2)}%</Text>
      ),
    },
  ]

  // 分离总计行和其他行
  const totalRow = data.find(item => item.sales_unit === '总计')
  const dataRows = data.filter(item => item.sales_unit !== '总计')

  return (
    <div>
      {/* 绩效统计表格 */}
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
          dataSource={dataRows}
          rowKey={(record) => record.sales_unit || `row-${dataRows.indexOf(record)}`}
          loading={loading}
          pagination={false}
          scroll={{ x: 1200 }}
          size="middle"
          summary={() => (
            totalRow ? (
              <Table.Summary fixed>
                <Table.Summary.Row style={{ background: '#f5f5f5' }}>
                  <Table.Summary.Cell index={0} colSpan={1}>
                    <Text strong style={{ color: '#1890ff', fontSize: '15px' }}>
                      {totalRow.sales_unit}
                    </Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={1} align="center">
                    <Text strong style={{ fontSize: '15px' }}>{totalRow.appointments_made}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={2} align="center">
                    <Text strong style={{ fontSize: '15px' }}>{totalRow.visits_completed}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={3} align="center">
                    <Text strong style={{ fontSize: '15px' }}>{totalRow.effective_appointment_rate.toFixed(2)}%</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="center">
                    <Text strong style={{ fontSize: '15px' }}>{totalRow.has_decision_authority}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={5} align="center">
                    <Text strong style={{ fontSize: '15px' }}>{totalRow.effective_visit_rate.toFixed(2)}%</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={6} align="center">
                    <Text strong style={{ fontSize: '15px' }}>{totalRow.lead_count}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={7} align="center">
                    <Text strong style={{ fontSize: '15px' }}>{totalRow.opportunity_count}</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={8} align="center">
                    <Text strong style={{ fontSize: '15px' }}>{totalRow.lead_mining_rate.toFixed(2)}%</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={9} align="center">
                    <Text strong style={{ fontSize: '15px' }}>{totalRow.lead_conversion_rate.toFixed(2)}%</Text>
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              </Table.Summary>
            ) : null
          )}
        />
      </Card>

      {/* 成员明细统计（如果有） */}
      {memberDetails && memberDetails.length > 0 && (
        <Card
          title={
            <Space>
              <div
                style={{
                  width: '4px',
                  height: '18px',
                  background: '#52c41a',
                  borderRadius: '2px',
                }}
              />
              <UserOutlined style={{ color: '#595959', fontSize: '16px' }} />
              <Text strong style={{ fontSize: '15px', color: '#262626' }}>成员明细统计</Text>
            </Space>
          }
          style={{
            borderRadius: '12px',
            border: '1px solid #e8e8e8',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
            background: '#ffffff',
          }}
          styles={{
            header: {
              borderBottom: '1px solid #f0f0f0',
              padding: '18px 24px',
            },
            body: { padding: '24px' }
          }}
        >
          <Table<MemberDetailStatistics>
            columns={columns.map(col => {
              if (col.key === 'sales_unit') {
                return {
                  ...col,
                  title: '成员姓名',
                  dataIndex: 'member_name',
                  key: 'member_name',
                  render: (text: string) => (
                    <Text style={{ fontSize: '14px' }}>{text}</Text>
                  ),
                } as any
              }
              return col as any
            })}
            dataSource={memberDetails}
            rowKey={(record, index) => record.member_name || `member-${index}`}
            loading={loading}
            pagination={false}
            scroll={{ x: 1200 }}
            size="middle"
          />
        </Card>
      )}
    </div>
  )
}

