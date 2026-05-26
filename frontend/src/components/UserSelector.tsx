/**
 * 用户选择组件
 */
import { useMemo } from 'react'
import { Select, SelectProps } from 'antd'
import { useQuery } from 'react-query'
import { userService, User } from '../services/user'
import { UserRole } from '../types/user'

interface UserSelectorProps extends Omit<SelectProps, 'options' | 'loading'> {
  role?: UserRole
  myGroup?: boolean  // 仅获取当前用户组内的成员（仅组长可用）
  placeholder?: string
}

const UserSelector: React.FC<UserSelectorProps> = ({ role, myGroup, placeholder = '请选择用户', ...props }) => {
  const { data: usersData, isLoading } = useQuery(
    ['users', role, myGroup],
    () => userService.getUsers({ role, my_group: myGroup }),
    {
      enabled: true,
    }
  )

  const users = usersData?.items || []
  const { options, searchTextByUserId } = useMemo(() => {
    const searchTextByUserId = new Map<number, string>()
    const options = users.map((user: User) => {
      // 下拉仅展示姓名与组别，不展示登录账号（username），避免在列表/筛选中非必要暴露账号
      let label = user.real_name
      let groupSuffix = ''
      if (role === UserRole.TEAM_LEADER && user.leader_groups && user.leader_groups.length > 0) {
        groupSuffix = user.leader_groups.map((g) => g.name).join('、')
        label = `${user.real_name} - ${groupSuffix}`
      }
      const searchText = [user.real_name, user.username, groupSuffix].filter(Boolean).join(' ').toLowerCase()
      searchTextByUserId.set(user.id, searchText)
      return { label, value: user.id }
    })
    return { options, searchTextByUserId }
  }, [users, role])

  return (
    <Select
      {...props}
      placeholder={placeholder}
      loading={isLoading}
      options={options}
      showSearch
      filterOption={(input, option) => {
        const id = Number(option?.value)
        const text =
          (Number.isFinite(id) ? searchTextByUserId.get(id) : undefined) ??
          String(option?.label ?? '').toLowerCase()
        return text.includes(input.trim().toLowerCase())
      }}
    />
  )
}

export default UserSelector
