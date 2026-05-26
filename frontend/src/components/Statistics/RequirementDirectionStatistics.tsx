/**
 * 线索需求方向统计组件
 */
import { useState, useMemo } from 'react'
import { Card, Typography, Space, Tag, Spin, Empty, Button } from 'antd'
import { FileTextOutlined, SortAscendingOutlined, AppstoreOutlined } from '@ant-design/icons'
import { Column } from '@ant-design/charts'
import { RequirementDirectionGroupStatistics, RequirementDirectionStatistics as RequirementDirectionStatisticsType } from '../../services/statistics'

const { Text, Title } = Typography

type SortMode = 'category' | 'count'

interface RequirementDirectionStatisticsProps {
  data: RequirementDirectionGroupStatistics[]
  loading?: boolean
  title?: string
}

export const RequirementDirectionStatistics = ({ 
  data, 
  loading = false,
  title = '线索需求方向统计'
}: RequirementDirectionStatisticsProps) => {
  const [sortMode, setSortMode] = useState<SortMode>('category')

  // 按数量排序的数据：将所有需求方向合并并按数量从高到低排序
  const sortedByCount = useMemo(() => {
    if (!data || data.length === 0) return []
    
    // 收集所有需求方向
    const allDirections: RequirementDirectionStatisticsType[] = []
    data.forEach(group => {
      group.directions.forEach(direction => {
        allDirections.push({
          direction: direction.direction,
          count: direction.count
        })
      })
    })
    
    // 按数量从高到低排序
    return allDirections.sort((a, b) => b.count - a.count)
  }, [data])

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

  return (
    <Card
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <Space>
            <div
              style={{
                width: '4px',
                height: '18px',
                background: '#52c41a',
                borderRadius: '2px',
              }}
            />
            <FileTextOutlined style={{ color: '#595959', fontSize: '16px' }} />
            <Text strong style={{ fontSize: '15px', color: '#262626' }}>{title}</Text>
          </Space>
          <Space>
            <Button
              type={sortMode === 'category' ? 'primary' : 'default'}
              icon={<AppstoreOutlined />}
              onClick={() => setSortMode('category')}
              size="small"
            >
              分类排序
            </Button>
            <Button
              type={sortMode === 'count' ? 'primary' : 'default'}
              icon={<SortAscendingOutlined />}
              onClick={() => setSortMode('count')}
              size="small"
            >
              数量排序
            </Button>
          </Space>
        </div>
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
      {sortMode === 'category' ? (
        // 分类排序：按原来的分组显示
        data.map((group, groupIndex) => (
          <div key={groupIndex} style={{ marginBottom: groupIndex < data.length - 1 ? '32px' : 0 }}>
            <Title level={5} style={{ marginBottom: '16px', color: '#262626' }}>
              {group.category}
            </Title>
            <Space wrap>
              {group.directions.map((direction, dirIndex) => (
                <Tag
                  key={dirIndex}
                  color={direction.count > 0 ? 'blue' : 'default'}
                  style={{
                    padding: '6px 16px',
                    fontSize: '14px',
                    borderRadius: '4px',
                    marginBottom: '8px',
                    marginRight: '8px',
                  }}
                >
                  {direction.direction}: {direction.count}
                </Tag>
              ))}
            </Space>
          </div>
        ))
      ) : (
        // 数量排序：按数量从高到低显示，不分组
        <div>
          <Title level={5} style={{ marginBottom: '16px', color: '#262626' }}>
            按需求数量排序（从高到低）
          </Title>
          
          {/* 图表可视化 */}
          {sortedByCount.length > 0 && (
            <div style={{ marginBottom: '24px' }}>
              <Column
                data={sortedByCount
                  .filter(item => item.count > 0) // 只显示有数据的项
                  .map((item, index) => ({
                    direction: item.direction,
                    count: item.count,
                    index: index,
                  }))}
                xField="direction"
                yField="count"
                color="#1890ff"
                columnStyle={{
                  radius: [4, 4, 0, 0],
                }}
                label={{
                  position: 'top',
                  style: {
                    fill: '#666',
                    fontSize: 12,
                  },
                }}
                xAxis={{
                  label: {
                    autoRotate: false,
                    style: {
                      fontSize: 12,
                    },
                    formatter: (text: string) => {
                      // 如果文本太长，截断并显示省略号
                      return text.length > 8 ? text.substring(0, 8) + '...' : text
                    },
                  },
                }}
                yAxis={{
                  label: {
                    style: {
                      fontSize: 12,
                    },
                  },
                  grid: {
                    line: {
                      style: {
                        stroke: '#f0f0f0',
                      },
                    },
                  },
                }}
                height={400}
                tooltip={{
                  formatter: (datum: any) => {
                    return {
                      name: '数量',
                      value: datum.count,
                    }
                  },
                }}
                animation={{
                  appear: {
                    animation: 'wave-in',
                    duration: 1000,
                  },
                }}
              />
            </div>
          )}
          
          {/* 标签列表 */}
          <div style={{ marginTop: sortedByCount.length > 0 ? '16px' : 0 }}>
            <Space wrap>
              {sortedByCount.map((direction, index) => (
                <Tag
                  key={index}
                  color={direction.count > 0 ? 'blue' : 'default'}
                  style={{
                    padding: '6px 16px',
                    fontSize: '14px',
                    borderRadius: '4px',
                    marginBottom: '8px',
                    marginRight: '8px',
                    fontWeight: direction.count > 5 ? 'bold' : 'normal',
                    opacity: direction.count > 0 ? 1 : 0.6,
                  }}
                >
                  {direction.direction}: <strong>{direction.count}</strong>
                </Tag>
              ))}
            </Space>
          </div>
          
          {sortedByCount.length === 0 && (
            <Empty description="暂无统计数据" />
          )}
        </div>
      )}
    </Card>
  )
}

