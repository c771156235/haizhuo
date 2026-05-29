/**
 * 绩效统计维度切换：客户来源 / 小组 / 专项任务
 */
import { Radio, Space } from 'antd'
import { ApartmentOutlined, ProjectOutlined, TeamOutlined } from '@ant-design/icons'

export type PerformanceDimension = 'customer_source' | 'group' | 'task'

interface PerformanceDimensionSelectorProps {
  value: PerformanceDimension
  onChange: (value: PerformanceDimension) => void
  /** 是否展示「小组」维度（仅总管） */
  showGroupDimension?: boolean
}

export const PerformanceDimensionSelector = ({
  value,
  onChange,
  showGroupDimension = false,
}: PerformanceDimensionSelectorProps) => {
  return (
    <Space>
      <ApartmentOutlined style={{ color: '#595959' }} />
      <Radio.Group
        value={value}
        onChange={(e) => onChange(e.target.value)}
        buttonStyle="solid"
      >
        <Radio.Button value="customer_source">
          <Space>
            <ApartmentOutlined />
            客户来源
          </Space>
        </Radio.Button>
        {showGroupDimension && (
          <Radio.Button value="group">
            <Space>
              <TeamOutlined />
              小组
            </Space>
          </Radio.Button>
        )}
        <Radio.Button value="task">
          <Space>
            <ProjectOutlined />
            专项任务
          </Space>
        </Radio.Button>
      </Radio.Group>
    </Space>
  )
}

export const PERFORMANCE_DIMENSION_LABELS: Record<PerformanceDimension, string> = {
  customer_source: '客户来源',
  group: '小组',
  task: '专项任务',
}

export const PERFORMANCE_DIMENSION_TITLES: Record<PerformanceDimension, string> = {
  customer_source: '销售单位绩效统计',
  group: '小组绩效统计',
  task: '专项任务绩效统计',
}
