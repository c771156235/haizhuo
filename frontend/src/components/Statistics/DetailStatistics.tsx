/**
 * 详细统计组件（工单、商机）
 */
import { useMemo } from 'react'
import { Row, Col, Card, Space, Progress, Divider, Typography, Tag, Statistic, Empty } from 'antd'
import { FileTextOutlined, DollarOutlined } from '@ant-design/icons'
import { Pie } from '@ant-design/charts'
import { DashboardStatistics } from '../../services/statistics'

const { Text } = Typography

interface DetailStatisticsProps {
  data: DashboardStatistics | undefined
  loading?: boolean
}

const workOrderPieColors = ['#1890ff', '#52c41a', '#722ed1', '#13c2c2', '#faad14']
const opportunityPieColors = ['#52c41a', '#1890ff', '#ff4d4f']

export const DetailStatistics = ({ data, loading = false }: DetailStatisticsProps) => {
  const workOrderPieData = useMemo(() => {
    const wo = data?.work_orders
    if (!wo) return []
    const rows = [
      { type: '待接单', value: wo.pending || 0 },
      { type: '已接单', value: wo.accepted || 0 },
      { type: '已拜访', value: (wo.completed || 0) + (wo.in_progress || 0) },
      { type: '已取消', value: wo.cancelled || 0 },
    ]
    return rows.filter((r) => r.value > 0)
  }, [data?.work_orders])

  const opportunityPieData = useMemo(() => {
    const o = data?.opportunities
    if (!o) return []
    const rows = [
      { type: '进行中', value: o.in_progress || 0 },
      { type: '转定', value: o.won || 0 },
      { type: '流失', value: o.lost || 0 },
    ]
    return rows.filter((r) => r.value > 0)
  }, [data?.opportunities])

  return (
    <Row gutter={[16, 16]}>
      {/* 工单统计 */}
      <Col xs={24} lg={12}>
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
              <FileTextOutlined style={{ color: '#595959', fontSize: '16px' }} />
              <Text strong style={{ fontSize: '15px', color: '#262626' }}>工单统计</Text>
            </Space>
          }
          style={{
            borderRadius: '10px',
            border: '1px solid #e8e8e8',
            boxShadow: '0 1px 4px rgba(0, 0, 0, 0.04)',
            height: '100%',
            background: '#ffffff',
          }}
          loading={loading}
          styles={{
            header: {
              borderBottom: '1px solid #f0f0f0',
              padding: '14px 16px',
            },
            body: { padding: '16px' }
          }}
        >
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <Text type="secondary" style={{ fontSize: '14px', color: '#8c8c8c' }}>总工单数</Text>
                <Statistic
                  value={data?.work_orders.total || 0}
                  valueStyle={{ fontSize: 18, color: '#262626', fontWeight: 600 }}
                />
              </div>
              <Progress
                percent={100}
                strokeColor="#e8e8e8"
                showInfo={false}
                size="small"
              />
            </div>
            
            <Divider style={{ margin: '12px 0', borderColor: '#f0f0f0' }} />
            
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <Text type="secondary" style={{ fontSize: '14px', color: '#8c8c8c' }}>待接单</Text>
                <Statistic
                  value={data?.work_orders.pending || 0}
                  valueStyle={{ fontSize: 16, color: '#1890ff', fontWeight: 600 }}
                />
              </div>
              <Progress
                percent={data?.work_orders.total ? Math.round(((data.work_orders.pending || 0) / data.work_orders.total) * 100) : 0}
                strokeColor="#1890ff"
                showInfo={false}
                size="small"
              />
            </div>
            
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <Text type="secondary" style={{ fontSize: '14px', color: '#8c8c8c' }}>已接单</Text>
                <Statistic
                  value={data?.work_orders.accepted || 0}
                  valueStyle={{ fontSize: 16, color: '#52c41a', fontWeight: 600 }}
                />
              </div>
              <Progress
                percent={data?.work_orders.total ? Math.round(((data.work_orders.accepted || 0) / data.work_orders.total) * 100) : 0}
                strokeColor="#52c41a"
                showInfo={false}
                size="small"
              />
            </div>
            
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <Text type="secondary" style={{ fontSize: '14px', color: '#8c8c8c' }}>已拜访</Text>
                <Space align="center">
                  <Statistic
                    value={data?.work_orders.completed || 0}
                    valueStyle={{ fontSize: 16, color: '#1890ff', fontWeight: 600 }}
                  />
                  {data?.work_orders.completion_rate && (
                    <Tag color="blue" style={{ margin: 0, fontSize: '12px', borderRadius: '4px' }}>
                      {data.work_orders.completion_rate}%
                    </Tag>
                  )}
                </Space>
              </div>
              <Progress
                percent={data?.work_orders.total ? Math.round(((data.work_orders.completed || 0) / data.work_orders.total) * 100) : 0}
                strokeColor="#1890ff"
                showInfo={false}
                size="small"
              />
            </div>

            <Divider style={{ margin: '8px 0 12px', borderColor: '#f0f0f0' }} />
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
              状态分布
            </Text>
            {workOrderPieData.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无分布数据" />
            ) : (
              <Pie
                data={workOrderPieData}
                angleField="value"
                colorField="type"
                innerRadius={0.52}
                height={220}
                color={workOrderPieColors}
                label={{
                  text: (d: { type: string; value: number }) => `${d.type} ${d.value}`,
                  style: { fontSize: 11 },
                }}
                legend={{
                  color: {
                    position: 'bottom',
                    layout: { justifyContent: 'center', alignItems: 'center' },
                  },
                }}
                tooltip={{
                  title: (d: { type: string }) => d.type,
                }}
              />
            )}
          </Space>
        </Card>
      </Col>

      {/* 商机统计 */}
      <Col xs={24} lg={12}>
        <Card
          title={
            <Space>
              <div
                style={{
                  width: '4px',
                  height: '18px',
                  background: '#fa8c16',
                  borderRadius: '2px',
                }}
              />
              <DollarOutlined style={{ color: '#595959', fontSize: '16px' }} />
              <Text strong style={{ fontSize: '15px', color: '#262626' }}>商机统计</Text>
            </Space>
          }
          style={{
            borderRadius: '10px',
            border: '1px solid #e8e8e8',
            boxShadow: '0 1px 4px rgba(0, 0, 0, 0.04)',
            height: '100%',
            background: '#ffffff',
          }}
          loading={loading}
          styles={{
            header: {
              borderBottom: '1px solid #f0f0f0',
              padding: '14px 16px',
            },
            body: { padding: '16px' }
          }}
        >
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <Text type="secondary" style={{ fontSize: '14px', color: '#8c8c8c' }}>总商机数</Text>
                <Statistic
                  value={data?.opportunities.total || 0}
                  valueStyle={{ fontSize: 18, color: '#262626', fontWeight: 600 }}
                />
              </div>
              <Progress
                percent={100}
                strokeColor="#e8e8e8"
                showInfo={false}
                size="small"
              />
            </div>
            
            <Divider style={{ margin: '12px 0', borderColor: '#f0f0f0' }} />
            
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <Text type="secondary" style={{ fontSize: '14px', color: '#8c8c8c' }}>进行中</Text>
                <Statistic
                  value={data?.opportunities.in_progress || 0}
                  valueStyle={{ fontSize: 16, color: '#52c41a', fontWeight: 600 }}
                />
              </div>
              <Progress
                percent={data?.opportunities.total ? Math.round(((data.opportunities.in_progress || 0) / data.opportunities.total) * 100) : 0}
                strokeColor="#52c41a"
                showInfo={false}
                size="small"
              />
            </div>
            
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <Text type="secondary" style={{ fontSize: '14px', color: '#8c8c8c' }}>转定</Text>
                <Space align="center">
                  <Statistic
                    value={data?.opportunities.won || 0}
                    valueStyle={{ fontSize: 16, color: '#1890ff', fontWeight: 600 }}
                  />
                  {data?.opportunities.conversion_rate && (
                    <Tag color="blue" style={{ margin: 0, fontSize: '12px', borderRadius: '4px' }}>
                      {data.opportunities.conversion_rate}%
                    </Tag>
                  )}
                </Space>
              </div>
              <Progress
                percent={data?.opportunities.total ? Math.round(((data.opportunities.won || 0) / data.opportunities.total) * 100) : 0}
                strokeColor="#1890ff"
                showInfo={false}
                size="small"
              />
            </div>
            
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <Text type="secondary" style={{ fontSize: '14px', color: '#8c8c8c' }}>流失</Text>
                <Statistic
                  value={data?.opportunities.lost || 0}
                  valueStyle={{ fontSize: 16, color: '#ff4d4f', fontWeight: 600 }}
                />
              </div>
              <Progress
                percent={data?.opportunities.total ? Math.round(((data.opportunities.lost || 0) / data.opportunities.total) * 100) : 0}
                strokeColor="#ff4d4f"
                showInfo={false}
                size="small"
              />
            </div>

            <Divider style={{ margin: '8px 0 12px', borderColor: '#f0f0f0' }} />
            <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
              状态分布
            </Text>
            {opportunityPieData.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无分布数据" />
            ) : (
              <Pie
                data={opportunityPieData}
                angleField="value"
                colorField="type"
                innerRadius={0.52}
                height={220}
                color={opportunityPieColors}
                label={{
                  text: (d: { type: string; value: number }) => `${d.type} ${d.value}`,
                  style: { fontSize: 11 },
                }}
                legend={{
                  color: {
                    position: 'bottom',
                    layout: { justifyContent: 'center', alignItems: 'center' },
                  },
                }}
                tooltip={{
                  title: (d: { type: string }) => d.type,
                }}
              />
            )}
          </Space>
        </Card>
      </Col>
    </Row>
  )
}

