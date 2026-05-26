/**
 * 成员转单 — 「转给组内成员」时的目标下拉（数据来自工单同组候选接口）
 * 展示规则与 UserSelector / GroupMemberSelector 一致：仅展示姓名，账号不参与展示（仍可搜索）
 */
import { useMemo } from 'react'
import { Select, SelectProps } from 'antd'
import { useQuery } from 'react-query'
import { workOrderService } from '../services/workOrder'

interface WorkOrderIntraGroupMemberSelectProps extends Omit<SelectProps, 'options' | 'loading'> {
  workOrderId?: number
  placeholder?: string
}

const WorkOrderIntraGroupMemberSelect: React.FC<WorkOrderIntraGroupMemberSelectProps> = ({
  workOrderId,
  placeholder = '请选择组内成员',
  ...props
}) => {
  const { data, isLoading, isError } = useQuery(
    ['work-order-intra-group-transfer-members', workOrderId],
    () => workOrderService.getIntraGroupTransferMembers(workOrderId!),
    { enabled: !!workOrderId }
  )

  const { options, searchTextByUserId } = useMemo(() => {
    const searchTextByUserId = new Map<number, string>()
    const options = (data || []).map((u) => {
      const displayName = (u.real_name || '').trim() || `用户 #${u.id}`
      const searchText = [u.real_name, u.username].filter(Boolean).join(' ').toLowerCase()
      searchTextByUserId.set(u.id, searchText)
      return { label: displayName, value: u.id }
    })
    return { options, searchTextByUserId }
  }, [data])

  if (!workOrderId) {
    return (
      <Select
        {...props}
        placeholder="工单信息加载中…"
        disabled
        options={[]}
      />
    )
  }

  if (!isLoading && isError) {
    return (
      <Select
        {...props}
        placeholder="加载组成员失败，请关闭弹窗后重试"
        disabled
        options={[]}
      />
    )
  }

  if (!isLoading && options.length === 0) {
    return (
      <Select
        {...props}
        placeholder="暂无其他组内成员可转单，请联系组长维护分组"
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
        const uid = Number(option?.value)
        const text =
          (Number.isFinite(uid) ? searchTextByUserId.get(uid) : undefined) ??
          String(option?.label ?? '').toLowerCase()
        return text.includes(input.trim().toLowerCase())
      }}
    />
  )
}

export default WorkOrderIntraGroupMemberSelect
