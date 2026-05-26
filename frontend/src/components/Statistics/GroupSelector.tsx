/**
 * 分组选择器组件（仅总管可见）
 */
import { Select, Space } from 'antd'
import { TeamOutlined } from '@ant-design/icons'
import { useQuery } from 'react-query'
import { groupService, Group } from '../../services/group'

const { Option } = Select

interface GroupSelectorProps {
  value?: number
  onChange?: (value: number | undefined) => void
  placeholder?: string
}

export const GroupSelector = ({ 
  value, 
  onChange,
  placeholder = '选择分组（可选）'
}: GroupSelectorProps) => {
  // 获取所有分组
  const { data: groupsData, isLoading } = useQuery(
    'allGroups',
    () => groupService.getGroups({ page_size: 100 }),
    {
      enabled: true, // 仅总管可见，但这里不控制，由父组件控制
    }
  )

  const groups = groupsData?.items || []

  const handleChange = (val: number | 0 | undefined) => {
    // 将 0 转换为 undefined（0 表示全部，但外部期望 undefined）
    onChange?.(val === 0 ? undefined : val)
  }

  return (
    <Space>
      <TeamOutlined style={{ color: '#595959' }} />
      <Select
        value={value ?? 0} // 将 undefined 转换为 0 以匹配选项值
        onChange={handleChange}
        placeholder={placeholder}
        allowClear
        style={{ minWidth: 200 }}
        loading={isLoading}
        showSearch
        filterOption={(input, option) => {
          const label = option?.label || option?.children
          if (typeof label === 'string') {
            return label.toLowerCase().includes(input.toLowerCase())
          }
          return false
        }}
      >
        <Option value={0}>全部</Option>
        {groups.map((group: Group) => (
          <Option key={group.id} value={group.id}>
            {group.name} ({group.member_count}人)
          </Option>
        ))}
      </Select>
    </Space>
  )
}

