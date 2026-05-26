/**
 * 统计模块主容器组件
 * 统一管理所有统计模块的显示和权限控制
 */
import { useQuery } from 'react-query'
import { useAuth } from '../../contexts/AuthContext'
import { statisticsService } from '../../services/statistics'
import { OverviewStatistics } from './OverviewStatistics'
import { DetailStatistics } from './DetailStatistics'
import { TimeRangeStatistics as TimeRangeStatisticsComponent } from './TimeRangeStatistics'
import { SalesUnitStatistics as SalesUnitStatisticsComponent } from './SalesUnitStatistics'
import { MemberWorkloadStatistics } from './MemberWorkloadStatistics'

interface StatisticsModuleProps {
  dashboardStatistics?: any
  isLoading?: boolean
}

export const StatisticsModule = ({ dashboardStatistics, isLoading = false }: StatisticsModuleProps) => {
  const { getCurrentRole } = useAuth()
  const currentRole = getCurrentRole()

  // 获取时间段统计（最近30天，按天分组）
  const { data: timeRangeStats, isLoading: timeRangeLoading } = useQuery(
    'timeRangeStatistics',
    () => statisticsService.getTimeRangeStatistics({
      group_by: 'day'
    }),
    {
      enabled: currentRole?.role === 'manager', // 仅总管可见（基于当前激活角色）
    }
  )

  // 获取部门数据统计
  const { data: salesUnitStats, isLoading: salesUnitLoading } = useQuery(
    'salesUnitStatistics',
    () => statisticsService.getSalesUnitStatistics(),
    {
      enabled: currentRole?.role === 'manager', // 仅总管可见（基于当前激活角色）
    }
  )

  return (
    <>
      {/* 概览统计卡片 - 所有用户可见 */}
      <OverviewStatistics data={dashboardStatistics} loading={isLoading} />

      {/* 详细统计（工单、商机）- 所有用户可见 */}
      <DetailStatistics data={dashboardStatistics} loading={isLoading} />

      {/* 时间段趋势统计 - 仅总管可见（基于当前激活角色） */}
      {currentRole?.role === 'manager' && timeRangeStats && timeRangeStats.length > 0 && (
        <TimeRangeStatisticsComponent 
          data={timeRangeStats} 
          loading={timeRangeLoading}
        />
      )}

      {/* 部门数据统计 - 仅总管可见（基于当前激活角色） */}
      {currentRole?.role === 'manager' && salesUnitStats && salesUnitStats.length > 0 && (
        <SalesUnitStatisticsComponent 
          data={salesUnitStats} 
          loading={salesUnitLoading}
        />
      )}

      {/* 成员工作量统计 - 仅总管和组长可见（基于当前激活角色） */}
      {(currentRole?.role === 'manager' || currentRole?.role === 'team_leader') && 
       dashboardStatistics?.member_workloads && 
       dashboardStatistics.member_workloads.length > 0 && (
        <MemberWorkloadStatistics 
          data={dashboardStatistics.member_workloads} 
          loading={isLoading}
        />
      )}
    </>
  )
}

