/**
 * 数据统计页面
 */
import { useState, useMemo, useEffect } from 'react'
import { Segmented, Empty, Button, Dropdown, message, Typography } from 'antd'
import { DownloadOutlined, FileExcelOutlined, FilePdfOutlined } from '@ant-design/icons'
import type { MenuProps } from 'antd'
import { useQuery } from 'react-query'
import { Dayjs } from 'dayjs'
import { useAuth } from '../contexts/AuthContext'
import { statisticsService } from '../services/statistics'
import { exportService } from '../services/export'
import {
  TimeRangeStatistics as TimeRangeStatisticsComponent,
  SalesUnitStatistics as SalesUnitStatisticsComponent,
  SalesUnitPerformanceStatistics as SalesUnitPerformanceStatisticsComponent,
  RequirementDirectionStatistics as RequirementDirectionStatisticsComponent,
  MemberWorkloadStatistics,
  OpportunityConvertedAmountStatistics as OpportunityConvertedAmountStatisticsComponent,
  GroupSelector,
  MemberDetailToggle,
  DateRangeSelector
} from '../components/Statistics'
import type { DateRangePreset } from '../components/Statistics'
import './Statistics.css'

const { Title } = Typography

const Statistics = () => {
  const { getCurrentRole } = useAuth()
  const currentRole = getCurrentRole()

  // 分组选择器状态（仅总管）
  const [selectedGroupId, setSelectedGroupId] = useState<number | undefined>(undefined)
  
  // 成员明细切换状态（仅组长）
  const [showMemberDetails, setShowMemberDetails] = useState<'group' | 'members'>('group')
  
  // 转订商机总金额统计的成员明细切换状态（仅组长）
  const [showConvertedAmountMemberDetails, setShowConvertedAmountMemberDetails] = useState<boolean>(false)
  
  // 时间范围选择器状态
  const [datePreset, setDatePreset] = useState<DateRangePreset>(null)
  const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null]>([null, null])
  
  // 计算时间范围参数
  const dateRangeParams = useMemo(() => {
    if (!dateRange[0] || !dateRange[1]) {
      return {}
    }
    return {
      start_date: dateRange[0].format('YYYY-MM-DD'),
      end_date: dateRange[1].format('YYYY-MM-DD')
    }
  }, [dateRange])

  const isManager = currentRole?.role === 'manager'
  const isTeamLeader = currentRole?.role === 'team_leader'
  const isMember = currentRole?.role === 'member'

  // 获取统计数据（未使用，但保留以备将来使用）
  // const { data: statistics, isLoading } = useQuery(
  //   ['dashboardStatistics', selectedGroupId, dateRangeParams],
  //   () => statisticsService.getDashboardStatistics({
  //     group_id: selectedGroupId,
  //     ...dateRangeParams
  //   }),
  //   {
  //     refetchInterval: 30000, // 每30秒刷新一次
  //     enabled: true, // 所有角色都可以看到dashboard统计
  //   }
  // )

  // 获取成员工作量统计（需要单独查询以支持分组）
  const { data: memberWorkloads, isLoading: memberWorkloadsLoading } = useQuery(
    ['memberWorkloads', selectedGroupId, dateRangeParams],
    () => statisticsService.getMemberWorkloads({
      limit: 50,
      group_id: selectedGroupId,
      ...dateRangeParams
    }),
    {
      enabled: isManager || isTeamLeader, // 总管和组长可见
    }
  )

  // 获取时间段统计（最近30天，按天分组）
  const { data: timeRangeStats, isLoading: timeRangeLoading } = useQuery(
    ['timeRangeStatistics', selectedGroupId, dateRangeParams],
    () => statisticsService.getTimeRangeStatistics({
      group_by: 'day',
      group_id: selectedGroupId,
      ...dateRangeParams
    }),
    {
      enabled: isManager, // 仅总管可见
    }
  )

  // 获取部门数据统计
  const { data: salesUnitStats, isLoading: salesUnitLoading } = useQuery(
    ['salesUnitStatistics', selectedGroupId, dateRangeParams],
    () => statisticsService.getSalesUnitStatistics({
      group_id: selectedGroupId,
      ...dateRangeParams
    }),
    {
      enabled: isManager, // 仅总管可见
    }
  )

  // 获取销售单位绩效统计
  const { data: salesUnitPerformanceStats, isLoading: salesUnitPerformanceLoading } = useQuery(
    ['salesUnitPerformanceStatistics', selectedGroupId, showMemberDetails, dateRangeParams],
    () => statisticsService.getSalesUnitPerformanceStatistics({
      group_id: selectedGroupId,
      include_member_details: showMemberDetails === 'members' && isTeamLeader,
      ...dateRangeParams
    }),
    {
      enabled: isManager || isTeamLeader || isMember, // 总管、组长、成员都可以看到
    }
  )

  // 获取转订商机总金额统计
  const { data: convertedAmountStats, isLoading: convertedAmountLoading } = useQuery(
    ['opportunityConvertedAmountStatistics', selectedGroupId, showConvertedAmountMemberDetails, dateRangeParams],
    () => statisticsService.getOpportunityConvertedAmountStatistics({
      group_id: selectedGroupId,
      include_member_details: showConvertedAmountMemberDetails && isTeamLeader,
      ...dateRangeParams
    }),
    {
      enabled: isManager || isTeamLeader || isMember, // 总管、组长、成员都可以看到
    }
  )

  const tabItems = [
    ...(isManager
      ? [{
          key: 'time-range',
          label: '时间段趋势统计',
          children: (
            <div>
              {/* 分组选择器、时间选择器和导出按钮 */}
              <div style={{ marginBottom: 16, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                  <GroupSelector
                    value={selectedGroupId}
                    onChange={setSelectedGroupId}
                  />
                  <DateRangeSelector
                    preset={datePreset}
                    dateRange={dateRange}
                    onPresetChange={setDatePreset}
                    onDateRangeChange={(dates) => setDateRange(dates || [null, null])}
                  />
                </div>
                <Dropdown
                  menu={{
                    items: [
                      {
                        key: 'excel',
                        label: '导出为Excel',
                        icon: <FileExcelOutlined />,
                        onClick: async () => {
                          try {
                            await exportService.exportTimeRangeStatisticsExcel({
                              group_id: selectedGroupId,
                              group_by: 'day',
                              ...dateRangeParams
                            })
                            message.success('导出成功')
                          } catch (error) {
                            message.error('导出失败，请重试')
                          }
                        }
                      },
                      {
                        key: 'pdf',
                        label: '导出为PDF',
                        icon: <FilePdfOutlined />,
                        onClick: async () => {
                          try {
                            await exportService.exportTimeRangeStatisticsPdf({
                              group_id: selectedGroupId,
                              group_by: 'day',
                              ...dateRangeParams
                            })
                            message.success('导出成功')
                          } catch (error) {
                            message.error('导出失败，请重试')
                          }
                        }
                      }
                    ] as MenuProps['items']
                  }}
                  trigger={['click']}
                >
                  <Button type="primary" icon={<DownloadOutlined />}>
                    导出
                  </Button>
                </Dropdown>
              </div>
              <TimeRangeStatisticsComponent
                data={timeRangeStats || []}
                loading={timeRangeLoading}
              />
            </div>
          )
        }]
      : []),
    ...(isManager
      ? [{
          key: 'sales-unit',
          label: '部门数据统计',
          children: (
            <div>
              {/* 分组选择器、时间选择器和导出按钮 */}
              <div style={{ marginBottom: 16, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                  <GroupSelector
                    value={selectedGroupId}
                    onChange={setSelectedGroupId}
                  />
                  <DateRangeSelector
                    preset={datePreset}
                    dateRange={dateRange}
                    onPresetChange={setDatePreset}
                    onDateRangeChange={(dates) => setDateRange(dates || [null, null])}
                  />
                </div>
                <Dropdown
                  menu={{
                    items: [
                      {
                        key: 'excel',
                        label: '导出为Excel',
                        icon: <FileExcelOutlined />,
                        onClick: async () => {
                          try {
                            await exportService.exportSalesUnitStatisticsExcel({
                              group_id: selectedGroupId,
                              ...dateRangeParams
                            })
                            message.success('导出成功')
                          } catch (error) {
                            message.error('导出失败，请重试')
                          }
                        }
                      },
                      {
                        key: 'pdf',
                        label: '导出为PDF',
                        icon: <FilePdfOutlined />,
                        onClick: async () => {
                          try {
                            await exportService.exportSalesUnitStatisticsPdf({
                              group_id: selectedGroupId,
                              ...dateRangeParams
                            })
                            message.success('导出成功')
                          } catch (error) {
                            message.error('导出失败，请重试')
                          }
                        }
                      }
                    ] as MenuProps['items']
                  }}
                  trigger={['click']}
                >
                  <Button type="primary" icon={<DownloadOutlined />}>
                    导出
                  </Button>
                </Dropdown>
              </div>
              <SalesUnitStatisticsComponent
                data={salesUnitStats || []}
                loading={salesUnitLoading}
              />
            </div>
          )
        }]
      : []),
    ...((isManager || isTeamLeader || isMember)
      ? [{
          key: 'sales-unit-performance',
          label: '绩效统计',
          children: (
            <div>
              {/* 分组选择器、成员明细切换、时间选择器和导出按钮 */}
              <div style={{ marginBottom: 16, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                  {isManager && (
                    <GroupSelector
                      value={selectedGroupId}
                      onChange={setSelectedGroupId}
                    />
                  )}
                  {isTeamLeader && (
                    <MemberDetailToggle
                      value={showMemberDetails}
                      onChange={setShowMemberDetails}
                    />
                  )}
                  <DateRangeSelector
                    preset={datePreset}
                    dateRange={dateRange}
                    onPresetChange={setDatePreset}
                    onDateRangeChange={(dates) => setDateRange(dates || [null, null])}
                  />
                </div>
                <Dropdown
                  menu={{
                    items: [
                      {
                        key: 'excel',
                        label: '导出为Excel',
                        icon: <FileExcelOutlined />,
                        onClick: async () => {
                          try {
                            await exportService.exportSalesUnitPerformanceStatisticsExcel({
                              group_id: selectedGroupId,
                              include_member_details: showMemberDetails === 'members' && isTeamLeader,
                              ...dateRangeParams
                            })
                            message.success('导出成功')
                          } catch (error) {
                            message.error('导出失败，请重试')
                          }
                        }
                      },
                      {
                        key: 'pdf',
                        label: '导出为PDF',
                        icon: <FilePdfOutlined />,
                        onClick: async () => {
                          try {
                            await exportService.exportSalesUnitPerformanceStatisticsPdf({
                              group_id: selectedGroupId,
                              include_member_details: showMemberDetails === 'members' && isTeamLeader,
                              ...dateRangeParams
                            })
                            message.success('导出成功')
                          } catch (error) {
                            message.error('导出失败，请重试')
                          }
                        }
                      }
                    ] as MenuProps['items']
                  }}
                  trigger={['click']}
                >
                  <Button type="primary" icon={<DownloadOutlined />}>
                    导出
                  </Button>
                </Dropdown>
              </div>
              <SalesUnitPerformanceStatisticsComponent
                data={salesUnitPerformanceStats?.statistics || []}
                memberDetails={showMemberDetails === 'members' ? salesUnitPerformanceStats?.member_details : undefined}
                loading={salesUnitPerformanceLoading}
              />
            </div>
          )
        }]
      : []),
    ...((isManager || isTeamLeader || isMember)
      ? [{
          key: 'requirement-direction',
          label: '线索需求方向统计',
          children: (
            <div>
              {/* 分组选择器、时间选择器和导出按钮 */}
              <div style={{ marginBottom: 16, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                  {isManager && (
                    <GroupSelector
                      value={selectedGroupId}
                      onChange={setSelectedGroupId}
                    />
                  )}
                  <DateRangeSelector
                    preset={datePreset}
                    dateRange={dateRange}
                    onPresetChange={setDatePreset}
                    onDateRangeChange={(dates) => setDateRange(dates || [null, null])}
                  />
                </div>
                <Dropdown
                  menu={{
                    items: [
                      {
                        key: 'excel',
                        label: '导出为Excel',
                        icon: <FileExcelOutlined />,
                        onClick: async () => {
                          try {
                            await exportService.exportRequirementDirectionStatisticsExcel({
                              group_id: selectedGroupId,
                              ...dateRangeParams
                            })
                            message.success('导出成功')
                          } catch (error) {
                            message.error('导出失败，请重试')
                          }
                        }
                      },
                      {
                        key: 'pdf',
                        label: '导出为PDF',
                        icon: <FilePdfOutlined />,
                        onClick: async () => {
                          try {
                            await exportService.exportRequirementDirectionStatisticsPdf({
                              group_id: selectedGroupId,
                              ...dateRangeParams
                            })
                            message.success('导出成功')
                          } catch (error) {
                            message.error('导出失败，请重试')
                          }
                        }
                      }
                    ] as MenuProps['items']
                  }}
                  trigger={['click']}
                >
                  <Button type="primary" icon={<DownloadOutlined />}>
                    导出
                  </Button>
                </Dropdown>
              </div>
              <RequirementDirectionStatisticsComponent
                data={salesUnitPerformanceStats?.requirement_directions || []}
                loading={salesUnitPerformanceLoading}
              />
            </div>
          )
        }]
      : []),
    ...((isManager || isTeamLeader)
      ? [{
          key: 'member-workload',
          label: '成员工作量统计',
          children: (
            <div>
              {/* 分组选择器、时间选择器和导出按钮 */}
              <div style={{ marginBottom: 16, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                  {isManager && (
                    <GroupSelector
                      value={selectedGroupId}
                      onChange={setSelectedGroupId}
                    />
                  )}
                  <DateRangeSelector
                    preset={datePreset}
                    dateRange={dateRange}
                    onPresetChange={setDatePreset}
                    onDateRangeChange={(dates) => setDateRange(dates || [null, null])}
                  />
                </div>
                <Dropdown
                  menu={{
                    items: [
                      {
                        key: 'excel',
                        label: '导出为Excel',
                        icon: <FileExcelOutlined />,
                        onClick: async () => {
                          try {
                            await exportService.exportMemberWorkloadExcel({
                              limit: 1000,
                              group_id: selectedGroupId,
                              ...dateRangeParams
                            })
                            message.success('导出成功')
                          } catch (error) {
                            message.error('导出失败，请重试')
                          }
                        }
                      },
                      {
                        key: 'pdf',
                        label: '导出为PDF',
                        icon: <FilePdfOutlined />,
                        onClick: async () => {
                          try {
                            await exportService.exportMemberWorkloadPdf({
                              limit: 1000,
                              group_id: selectedGroupId,
                              ...dateRangeParams
                            })
                            message.success('导出成功')
                          } catch (error) {
                            message.error('导出失败，请重试')
                          }
                        }
                      }
                    ] as MenuProps['items']
                  }}
                  trigger={['click']}
                >
                  <Button type="primary" icon={<DownloadOutlined />}>
                    导出
                  </Button>
                </Dropdown>
              </div>
              <MemberWorkloadStatistics
                data={memberWorkloads || []}
                loading={memberWorkloadsLoading}
              />
            </div>
          )
        }]
      : []),
    ...((isManager || isTeamLeader || isMember)
      ? [{
          key: 'opportunity-converted-amount',
          label: '转订商机总金额',
          children: (
            <div>
              {/* 分组选择器、成员明细切换、时间选择器和导出按钮 */}
              <div style={{ marginBottom: 16, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                  {isManager && (
                    <GroupSelector
                      value={selectedGroupId}
                      onChange={setSelectedGroupId}
                    />
                  )}
                  {isTeamLeader && (
                    <MemberDetailToggle
                      value={showConvertedAmountMemberDetails ? 'members' : 'group'}
                      onChange={(value) => setShowConvertedAmountMemberDetails(value === 'members')}
                    />
                  )}
                  <DateRangeSelector
                    preset={datePreset}
                    dateRange={dateRange}
                    onPresetChange={setDatePreset}
                    onDateRangeChange={(dates) => setDateRange(dates || [null, null])}
                  />
                </div>
                <Dropdown
                  menu={{
                    items: [
                      {
                        key: 'excel',
                        label: '导出为Excel',
                        icon: <FileExcelOutlined />,
                        onClick: async () => {
                          try {
                            await exportService.exportOpportunityConvertedAmountExcel({
                              group_id: selectedGroupId,
                              include_member_details: showConvertedAmountMemberDetails && isTeamLeader,
                              ...dateRangeParams
                            })
                            message.success('导出成功')
                          } catch (error) {
                            message.error('导出失败，请重试')
                          }
                        }
                      },
                      {
                        key: 'pdf',
                        label: '导出为PDF',
                        icon: <FilePdfOutlined />,
                        onClick: async () => {
                          try {
                            await exportService.exportOpportunityConvertedAmountPdf({
                              group_id: selectedGroupId,
                              include_member_details: showConvertedAmountMemberDetails && isTeamLeader,
                              ...dateRangeParams
                            })
                            message.success('导出成功')
                          } catch (error) {
                            message.error('导出失败，请重试')
                          }
                        }
                      }
                    ] as MenuProps['items']
                  }}
                  trigger={['click']}
                >
                  <Button type="primary" icon={<DownloadOutlined />}>
                    导出
                  </Button>
                </Dropdown>
              </div>
              <OpportunityConvertedAmountStatisticsComponent
                data={convertedAmountStats || []}
                loading={convertedAmountLoading}
              />
            </div>
          )
        }]
      : [])
  ]

  const [activeKey, setActiveKey] = useState(tabItems[0]?.key)
  const segmentedOptions = useMemo(
    () => tabItems.map((item) => ({ label: item.label, value: item.key })),
    [tabItems]
  )

  useEffect(() => {
    if (tabItems.length === 0) return
    if (!activeKey || !tabItems.some((item) => item.key === activeKey)) {
      setActiveKey(tabItems[0].key)
    }
  }, [tabItems, activeKey])

  const activeTabItem = tabItems.find((item) => item.key === activeKey) || tabItems[0]

  if (tabItems.length === 0) {
    return (
      <div>
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Title level={3} style={{ margin: 0 }}>数据统计</Title>
        </div>
        <Empty description="暂无可查看的统计模块" />
      </div>
    )
  }

  return (
    <div>
      {/* 页面标题 */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Title level={3} style={{ margin: 0 }}>数据统计</Title>
      </div>

      {/* 分段导航展示各统计模块 */}
      <div className="statistics-segmented-wrap">
        <Segmented
          className="statistics-segmented"
          options={segmentedOptions}
          value={activeTabItem?.key}
          onChange={(value) => setActiveKey(String(value))}
        />
      </div>

      <div style={{ marginTop: 24 }}>
        {activeTabItem?.children}
      </div>
    </div>
  )
}

export default Statistics

