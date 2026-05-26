/**
 * 概览统计卡片组件
 */
import type { ReactNode } from 'react'
import { Row, Col, Card, Space, Typography, Statistic, Progress } from 'antd'
import {
  ClockCircleOutlined,
  SolutionOutlined,
  CheckCircleOutlined,
  DollarOutlined,
} from '@ant-design/icons'
import { DashboardStatistics } from '../../services/statistics'

const { Text } = Typography

interface OverviewStatisticsProps {
  data: DashboardStatistics | undefined
  loading?: boolean
}

type StatCard = {
  title: string
  value: number
  icon: ReactNode
  color: string
  bgColor: string
  description: string
  ringPercent?: number
  ringStroke?: string
}

export const OverviewStatistics = ({ data, loading = false }: OverviewStatisticsProps) => {
  const completionRate = Math.min(100, Math.max(0, data?.tasks.completion_rate ?? 0))
  const conversionRate = Math.min(100, Math.max(0, data?.opportunities.conversion_rate ?? 0))

  const statisticCards: StatCard[] = [
    {
      title: '待处理任务',
      value: data?.tasks.pending || 0,
      icon: <ClockCircleOutlined />,
      color: '#1890ff',
      bgColor: '#e6f7ff',
      description: '需要处理的任务',
    },
    {
      title: '进行中任务',
      value: (data?.tasks.in_progress || 0) + (data?.tasks.dispatched || 0),
      icon: <SolutionOutlined />,
      color: '#52c41a',
      bgColor: '#f6ffed',
      description: '正在执行的任务',
    },
    {
      title: '已完成任务',
      value: data?.tasks.completed || 0,
      icon: <CheckCircleOutlined />,
      color: '#1890ff',
      bgColor: '#e6f7ff',
      description: `完成率 ${completionRate}%`,
      ringPercent: completionRate,
      ringStroke: '#1890ff',
    },
    {
      title: '商机数量',
      value: data?.opportunities.total || 0,
      icon: <DollarOutlined />,
      color: '#fa8c16',
      bgColor: '#fff7e6',
      description: `转化率 ${conversionRate}%`,
      ringPercent: conversionRate,
      ringStroke: '#fa8c16',
    },
  ]

  return (
    <Row gutter={[16, 16]}>
      {statisticCards.map((card, index) => (
        <Col xs={24} sm={12} lg={6} key={index}>
          <Card
            style={{
              borderRadius: '10px',
              border: '1px solid #e8e8e8',
              boxShadow: '0 1px 4px rgba(0, 0, 0, 0.04)',
              transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              cursor: 'pointer',
              height: '100%',
              background: '#ffffff',
              overflow: 'hidden',
              position: 'relative',
            }}
            styles={{ body: { padding: '16px' } }}
            loading={loading}
            hoverable
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.08)'
              e.currentTarget.style.borderColor = card.color
              e.currentTarget.style.transform = 'translateY(-2px)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = '0 1px 4px rgba(0, 0, 0, 0.04)'
              e.currentTarget.style.borderColor = '#e8e8e8'
              e.currentTarget.style.transform = 'translateY(0)'
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                height: '3px',
                background: `linear-gradient(90deg, ${card.color} 0%, ${card.color}80 100%)`,
              }}
            />

            <Space direction="vertical" size={8} style={{ width: '100%', marginTop: '3px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '8px',
                      background: card.bgColor,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '20px',
                      color: card.color,
                      marginBottom: 8,
                    }}
                  >
                    {card.icon}
                  </div>
                  <Statistic
                    title={card.title}
                    value={card.value}
                    valueStyle={{ fontSize: 28, fontWeight: 700, color: '#262626' }}
                  />
                </div>
                {card.ringPercent !== undefined && (
                  <div style={{ flexShrink: 0, paddingTop: 4 }}>
                    <Progress
                      type="circle"
                      percent={card.ringPercent}
                      size={72}
                      strokeColor={card.ringStroke}
                      trailColor="rgba(0,0,0,0.06)"
                      format={(p) => <span style={{ fontSize: 13, fontWeight: 600 }}>{p}%</span>}
                    />
                  </div>
                )}
              </div>
              <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.4 }}>
                {card.description}
              </Text>
            </Space>
          </Card>
        </Col>
      ))}
    </Row>
  )
}
