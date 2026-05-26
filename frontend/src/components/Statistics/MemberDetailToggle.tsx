/**
 * 成员明细切换组件（仅组长可见）
 */
import { Radio, Space } from 'antd'
import { TeamOutlined, UserOutlined } from '@ant-design/icons'

interface MemberDetailToggleProps {
  value: 'group' | 'members'
  onChange?: (value: 'group' | 'members') => void
}

export const MemberDetailToggle = ({ 
  value, 
  onChange 
}: MemberDetailToggleProps) => {
  return (
    <Space>
      <TeamOutlined style={{ color: '#595959' }} />
      <Radio.Group
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        buttonStyle="solid"
      >
        <Radio.Button value="group">
          <Space>
            <TeamOutlined />
            组总体
          </Space>
        </Radio.Button>
        <Radio.Button value="members">
          <Space>
            <UserOutlined />
            成员明细
          </Space>
        </Radio.Button>
      </Radio.Group>
    </Space>
  )
}

