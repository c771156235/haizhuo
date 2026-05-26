/**
 * 组内成员选择组件（用于组长转派工单）
 * 展示规则与 UserSelector 一致：下拉仅展示姓名，不展示登录账号；搜索仍可按账号匹配
 */
import { useMemo } from 'react'
import { Select, SelectProps } from 'antd'
import { useQuery } from 'react-query'
import { groupService } from '../services/group'
import { useAuth } from '../contexts/AuthContext'

interface GroupMemberSelectorProps extends Omit<SelectProps, 'options' | 'loading'> {
  placeholder?: string
}

const GroupMemberSelector: React.FC<GroupMemberSelectorProps> = ({ placeholder = '请选择组内成员', ...props }) => {
  const { user } = useAuth()
  
  // 获取当前用户作为组长的组
  // 注意：page_size最大为100，通常一个组长只有一个组
  // 使用 my_group=true 参数，允许组长查询自己作为组长的组
  const { data: groupsData, isLoading: groupsLoading } = useQuery(
    ['groups', 'leader', user?.id],
    () => groupService.getGroups({ my_group: true, page: 1, page_size: 100 }),
    {
      enabled: !!user,
    }
  )

  // 查找当前用户作为组长的组（兼容主组长 leader_id 与多组长 leader_ids）
  const leaderGroup = groupsData?.items?.find((group) => {
    if (!user?.id) return false
    if (group.leader_id === user.id) return true
    return Array.isArray(group.leader_ids) && group.leader_ids.includes(user.id)
  })
  
  // 如果找到了组，获取组内成员
  const { data: membersData, isLoading: membersLoading } = useQuery(
    ['group-members', leaderGroup?.id],
    () => groupService.getGroupMembers(leaderGroup!.id),
    {
      enabled: !!leaderGroup,
    }
  )

  const members = membersData || []
  const isLoading = groupsLoading || membersLoading

  const { options, searchTextByMemberId } = useMemo(() => {
    const searchTextByMemberId = new Map<number, string>()
    const options = members.map((member) => {
      const displayName = (member.real_name || '').trim() || `用户 #${member.id}`
      const searchText = [member.real_name, member.username].filter(Boolean).join(' ').toLowerCase()
      searchTextByMemberId.set(member.id, searchText)
      return { label: displayName, value: member.id }
    })
    return { options, searchTextByMemberId }
  }, [members])

  // 如果没有组，显示提示并禁用
  if (!isLoading && !leaderGroup) {
    return (
      <Select
        {...props}
        placeholder="您还没有组，请联系总管创建组并添加成员"
        disabled
        options={[]}
      />
    )
  }

  if (!isLoading && members.length === 0) {
    return (
      <Select
        {...props}
        placeholder="组内暂无成员，请联系总管添加成员"
        disabled
        options={[]}
      />
    )
  }

  return (
    <Select
      {...props}
      placeholder={placeholder}
      loading={isLoading}
      options={options}
      showSearch
      filterOption={(input, option) => {
        const mid = Number(option?.value)
        const text =
          (Number.isFinite(mid) ? searchTextByMemberId.get(mid) : undefined) ??
          String(option?.label ?? '').toLowerCase()
        return text.includes(input.trim().toLowerCase())
      }}
    />
  )
}

export default GroupMemberSelector

