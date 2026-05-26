/**
 * 工作台页面
 */
import { Card, Row, Col, Typography, Space, Tag, Avatar, FloatButton, Progress, Alert, Statistic } from 'antd'
import { 
  UserOutlined, 
  SettingOutlined,
  ClockCircleOutlined,
  FireOutlined,
  TrophyOutlined,
  ThunderboltOutlined,
  RocketOutlined,
  StarOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { useQuery } from 'react-query'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { statisticsService, DashboardStatistics } from '../services/statistics'
import { useAuth } from '../contexts/AuthContext'
import { UserRoleLabels, UserRole } from '../types/user'
import dayjs from 'dayjs'
import { uploadService } from '../services/upload'
import { OverviewStatistics, DetailStatistics } from '../components/Statistics'
import { TodoCenter } from '../components/TodoCenter'
import { DashboardLayoutSettings } from '../components/DashboardLayoutSettings'
import {
  DashboardLayoutConfig,
  getDashboardLayout,
} from '../services/dashboardLayout'
import { getTodos } from '../services/todo'
import { groupService, Group } from '../services/group'

const { Text } = Typography

// 获取问候语（纯函数）
const getGreetingByHour = (hour: number): string => {
  if (hour >= 5 && hour < 9) return '早上好'
  if (hour >= 9 && hour < 12) return '上午好'
  if (hour >= 12 && hour < 14) return '中午好'
  if (hour >= 14 && hour < 18) return '下午好'
  if (hour >= 18 && hour < 22) return '晚上好'
  return '夜深了'
}

// 获取成就等级（纯函数）
const getAchievementLevel = (days: number) => {
  if (days < 7) return { level: '新手', icon: <StarOutlined />, color: '#8c8c8c' }
  if (days < 30) return { level: '入门', icon: <RocketOutlined />, color: '#52c41a' }
  if (days < 90) return { level: '进阶', icon: <TrophyOutlined />, color: '#1890ff' }
  if (days < 180) return { level: '资深', icon: <FireOutlined />, color: '#fa8c16' }
  if (days < 365) return { level: '专家', icon: <ThunderboltOutlined />, color: '#096dd9' }
  return { level: '大师', icon: <TrophyOutlined />, color: '#faad14' }
}

const Dashboard = () => {
  const { user, getCurrentRole } = useAuth()
  const currentRole = getCurrentRole()
  const [layoutConfig, setLayoutConfig] = useState<DashboardLayoutConfig>(() =>
    getDashboardLayout(user?.id)
  )
  const [settingsVisible, setSettingsVisible] = useState(false)
  const [currentTime, setCurrentTime] = useState(dayjs())
  
  // 获取统计数据
  const { data: statistics, isLoading, error } = useQuery<DashboardStatistics>(
    'dashboardStatistics',
    () => statisticsService.getDashboardStatistics(),
    {
      refetchInterval: 30000, // 每30秒刷新一次
      retry: 2, // 失败时重试2次
      onError: (err) => {
        const { logError } = require('../utils/errorHandler')
        logError('获取统计数据失败', err)
      },
    }
  )

  // 获取待办事项数据（用于统一显示待办数量）
  const { data: todos = [] } = useQuery(
    ['todos', user?.id, currentRole?.role],
    () => getTodos(),
    {
      refetchInterval: 6000, // 每6秒刷新一次，提高实时性
      enabled: !!user && !!currentRole, // 只有用户登录且有角色后才获取待办事项
    }
  )

  // 获取当前用户所属的组信息（仅成员和组长）
  const isMemberOrLeader = useMemo(() => {
    return currentRole?.role === UserRole.MEMBER || currentRole?.role === UserRole.TEAM_LEADER
  }, [currentRole?.role])

  const { data: myGroup, isLoading: groupLoading, error: groupError } = useQuery<Group | null>(
    ['myGroup', user?.id],
    () => groupService.getMyGroup(),
    {
      enabled: isMemberOrLeader, // 只有成员和组长才获取组信息
      retry: false, // 如果用户没有组，不重试
      refetchInterval: 60000, // 每分钟刷新一次
    }
  )

  useEffect(() => {
    setLayoutConfig(getDashboardLayout(user?.id))
  }, [user?.id])

  // 更新时间（只更新秒数，减少不必要的重渲染）
  useEffect(() => {
    let timer: number | null = null

    const stop = () => {
      if (timer !== null) {
        window.clearInterval(timer)
        timer = null
      }
    }

    const start = () => {
      if (timer !== null) return
      timer = window.setInterval(() => {
        setCurrentTime(dayjs())
      }, 1000)
    }

    const sync = () => {
      if (document.visibilityState === 'visible') {
        setCurrentTime(dayjs())
        start()
      } else {
        stop()
      }
    }

    sync()
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('focus', sync)

    return () => {
      stop()
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('focus', sync)
    }
  }, [])

  // 计算问候语（使用 useMemo 优化）
  const currentHour = currentTime.hour()
  const greeting = useMemo(() => getGreetingByHour(currentHour), [currentHour])

  // 计算贡献天数（使用 useMemo 优化）
  const contributionDays = useMemo(() => {
    if (!user?.created_at) return 0
    return Math.max(0, dayjs().diff(dayjs(user.created_at), 'day'))
  }, [user?.created_at])

  // 计算成就等级（使用 useMemo 优化）
  const achievement = useMemo(() => getAchievementLevel(contributionDays), [contributionDays])

  // 计算今日统计数据（使用 useMemo 优化）
  // 统一使用todos数据源来显示待办数量，确保与待办/提醒中心一致
  const todayStats = useMemo(() => {
    // 使用实际的待办事项数量
    const totalPending = todos.length
    // 计算已完成的任务和已拜访工单
    const todayTasks = statistics?.tasks || { completed: 0 }
    const todayWorkOrders = statistics?.work_orders || { completed: 0 }
    const totalCompleted = (todayTasks.completed || 0) + (todayWorkOrders.completed || 0)
    const total = totalPending + totalCompleted
    const todayProgress = total > 0 ? Math.round((totalCompleted / total) * 100) : 0
    
    return { totalPending, totalCompleted, todayProgress }
  }, [todos.length, statistics?.tasks, statistics?.work_orders])

  // 处理布局配置变更（使用 useCallback 优化）
  const handleConfigChange = useCallback((newConfig: DashboardLayoutConfig) => {
    setLayoutConfig(newConfig)
  }, [])

  // 计算排序后的模块（使用 useMemo 优化）
  const { welcomeModule, otherModules } = useMemo(() => {
    const sorted = [...layoutConfig.modules]
      .sort((a, b) => a.order - b.order)
      .filter(m => m.visible)
    
    return {
      welcomeModule: sorted.find(m => m.id === 'welcome'),
      otherModules: sorted.filter(m => m.id !== 'welcome'),
    }
  }, [layoutConfig.modules])

  // 渲染欢迎模块（使用 useMemo 优化）
  const welcomeModuleContent = useMemo(() => {
    if (!user) return null

    return (
      <Card
        key="welcome"
        style={{
          borderRadius: '16px',
          border: '1px solid rgba(24, 144, 255, 0.15)',
          boxShadow: '0 4px 20px rgba(24, 144, 255, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08)',
          background: 'linear-gradient(135deg, #e6f4ff 0%, #bae0ff 30%, #91d5ff 60%, #e6f4ff 100%)',
          marginBottom: 0,
          position: 'relative',
          overflow: 'hidden',
        }}
        styles={{ body: { padding: '24px' } }}
      >
        {/* 背景装饰 - 增强视觉效果 */}
        <div
          style={{
            position: 'absolute',
            top: '-80px',
            right: '-80px',
            width: '240px',
            height: '240px',
            background: 'linear-gradient(135deg, rgba(24, 144, 255, 0.15) 0%, rgba(19, 194, 194, 0.12) 100%)',
            borderRadius: '50%',
            filter: 'blur(50px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-70px',
            left: '-70px',
            width: '200px',
            height: '200px',
            background: 'linear-gradient(135deg, rgba(82, 196, 26, 0.12) 0%, rgba(24, 144, 255, 0.08) 100%)',
            borderRadius: '50%',
            filter: 'blur(45px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '300px',
            height: '300px',
            background: 'radial-gradient(circle, rgba(24, 144, 255, 0.08) 0%, transparent 70%)',
            borderRadius: '50%',
            filter: 'blur(60px)',
          }}
        />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <Row gutter={[16, 16]} align="middle">
            {/* 左侧：用户信息 */}
            <Col xs={24} md={14}>
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                {/* 问候语 */}
                <div>
                  <Text style={{ fontSize: '16px', color: '#0050b3', fontWeight: 500 }}>
                    {greeting}，
                  </Text>
                  <Text strong style={{ fontSize: '22px', color: '#003a8c', marginLeft: '6px', fontWeight: 600 }}>
                    {user.real_name || user.username}
                  </Text>
                </div>
                
                {/* 用户详情 */}
                <Space size={12} wrap>
                  <Avatar
                    size={64}
                    src={user?.avatar ? uploadService.getAvatarUrl(user.avatar) : undefined}
                    icon={!user?.avatar && <UserOutlined />}
                    style={{
                      backgroundColor: '#1890ff',
                      flexShrink: 0,
                      boxShadow: '0 4px 16px rgba(24, 144, 255, 0.35), 0 2px 8px rgba(0, 0, 0, 0.1)',
                      border: '3px solid rgba(255, 255, 255, 0.8)',
                    }}
                  />
                  <Space direction="vertical" size={6} style={{ flex: 1 }}>
                    <Space size={8} wrap>
                      <Tag
                        style={{
                          fontSize: '13px',
                          padding: '4px 12px',
                          borderRadius: '16px',
                          background: 'rgba(255, 255, 255, 0.95)',
                          border: '1.5px solid rgba(82, 196, 26, 0.4)',
                          color: '#389e0d',
                          margin: 0,
                          fontWeight: 600,
                          height: '28px',
                          lineHeight: '20px',
                          boxShadow: '0 2px 4px rgba(82, 196, 26, 0.15)',
                        }}
                      >
                        {user?.username}
                      </Tag>
                      <Tag
                        icon={achievement.icon}
                        style={{
                          fontSize: '13px',
                          padding: '4px 12px',
                          borderRadius: '16px',
                          background: `rgba(255, 255, 255, 0.95)`,
                          border: `1.5px solid ${achievement.color}50`,
                          color: achievement.color,
                          margin: 0,
                          fontWeight: 600,
                          height: '28px',
                          lineHeight: '20px',
                          boxShadow: `0 2px 4px ${achievement.color}20`,
                        }}
                      >
                        {achievement.level}
                      </Tag>
                      <Tag
                        style={{
                          fontSize: '13px',
                          padding: '4px 12px',
                          borderRadius: '16px',
                          background: 'rgba(255, 255, 255, 0.95)',
                          border: '1.5px solid rgba(24, 144, 255, 0.4)',
                          color: '#0050b3',
                          margin: 0,
                          fontWeight: 600,
                          height: '28px',
                          lineHeight: '20px',
                          boxShadow: '0 2px 4px rgba(24, 144, 255, 0.15)',
                        }}
                      >
                        {UserRoleLabels[currentRole?.role as keyof typeof UserRoleLabels] || currentRole?.role || user?.role}
                      </Tag>
                    </Space>
                    <Space size={8} style={{ marginTop: '4px' }}>
                      <Text style={{ fontSize: '14px', color: '#0050b3', fontWeight: 500 }}>
                        {user?.sales_unit || '未设置部门'}
                      </Text>
                      <Text style={{ fontSize: '14px', color: '#096dd9', fontWeight: 500 }}>
                        · 贡献 {contributionDays} 天
                      </Text>
                    </Space>
                  </Space>
                </Space>
              </Space>
            </Col>

            {/* 右侧：时间 */}
            <Col xs={24} md={10}>
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                {/* 时间显示 */}
                <div style={{ textAlign: 'right' }}>
                  <Space direction="vertical" size={4} align="end">
                    <Space size={6}>
                      <ClockCircleOutlined style={{ color: '#0050b3', fontSize: '14px' }} />
                      <Text style={{ fontSize: '13px', color: '#0050b3', fontWeight: 500 }}>
                        {currentTime.format('YYYY年MM月DD日')}
                      </Text>
                    </Space>
                    <Text strong style={{ fontSize: '32px', color: '#003a8c', fontFamily: 'monospace', fontWeight: 700, letterSpacing: '2px', textShadow: '0 2px 4px rgba(0, 0, 0, 0.1)' }}>
                      {currentTime.format('HH:mm:ss')}
                    </Text>
                  </Space>
                </div>
              </Space>
            </Col>
          </Row>

          {/* 组信息和统计卡片 - 并排显示 */}
          <Row gutter={[16, 16]} style={{ marginTop: '20px' }}>
            {/* 组信息卡片 - 仅成员和组长显示 */}
            <Col xs={24} md={isMemberOrLeader ? 14 : 0} style={{ display: isMemberOrLeader ? 'block' : 'none' }}>
              {isMemberOrLeader && (
                <>
                  {groupLoading ? (
                    <div style={{ 
                      background: 'rgba(255, 255, 255, 0.95)',
                      borderRadius: '12px',
                      padding: '16px',
                      textAlign: 'center',
                      border: '1px solid rgba(24, 144, 255, 0.15)',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Text style={{ fontSize: '13px', color: '#0050b3' }}>加载组信息中...</Text>
                    </div>
                  ) : groupError ? (
                    <div style={{ 
                      background: 'rgba(255, 255, 255, 0.95)',
                      borderRadius: '12px',
                      padding: '16px',
                      textAlign: 'center',
                      border: '1px solid rgba(255, 77, 79, 0.15)',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Text style={{ fontSize: '13px', color: '#ff4d4f' }}>
                        加载组信息失败
                      </Text>
                    </div>
                  ) : myGroup === null ? (
                    <div style={{ 
                      background: 'rgba(255, 255, 255, 0.95)',
                      borderRadius: '12px',
                      padding: '16px',
                      textAlign: 'center',
                      border: '1px solid rgba(250, 173, 20, 0.15)',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Text style={{ fontSize: '13px', color: '#faad14' }}>
                        您尚未被分配到任何组，请联系管理员
                      </Text>
                    </div>
                  ) : myGroup ? (
                    <div style={{
                      background: 'rgba(255, 255, 255, 0.95)',
                      borderRadius: '12px',
                      padding: '16px',
                      border: '1px solid rgba(24, 144, 255, 0.15)',
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
                      height: '100%',
                    }}>
                      <Row gutter={[16, 0]} align="middle">
                        <Col xs={24} sm={24} md={6}>
                          <Space size={12}>
                            <div
                              style={{
                                width: '48px',
                                height: '48px',
                                borderRadius: '12px',
                                background: 'linear-gradient(135deg, #e6f7ff 0%, #bae0ff 100%)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '24px',
                                color: '#1890ff',
                                flexShrink: 0,
                              }}
                            >
                              <TeamOutlined />
                            </div>
                            <Space direction="vertical" size={4}>
                              <Text strong style={{ fontSize: '18px', color: '#003a8c' }}>
                                {myGroup.name}
                              </Text>
                              <Tag
                                style={{
                                  fontSize: '12px',
                                  padding: '2px 10px',
                                  borderRadius: '12px',
                                  background: 'rgba(24, 144, 255, 0.1)',
                                  border: '1px solid rgba(24, 144, 255, 0.3)',
                                  color: '#0050b3',
                                  margin: 0,
                                  height: '22px',
                                  lineHeight: '18px',
                                }}
                              >
                                {currentRole?.role === UserRole.TEAM_LEADER ? '组长' : '成员'}
                              </Tag>
                            </Space>
                          </Space>
                        </Col>
                        <Col xs={24} sm={24} md={18}>
                          <Row gutter={[24, 0]}>
                            <Col xs={24} sm={8}>
                              <div>
                                <Text style={{ fontSize: '12px', color: '#8c8c8c', display: 'block', marginBottom: '6px' }}>
                                  组长
                                </Text>
                                <Space size={[4, 4]} wrap style={{ width: '100%' }}>
                                  {myGroup.leader_names && myGroup.leader_names.length > 0 ? (
                                    myGroup.leader_names.map((name, index) => (
                                      <Tag
                                        key={myGroup.leader_ids?.[index] ?? `${name}-${index}`}
                                        style={{
                                          margin: 0,
                                          fontSize: '13px',
                                          fontWeight: 600,
                                          color: '#003a8c',
                                          background: 'rgba(24, 144, 255, 0.08)',
                                          border: '1px solid rgba(24, 144, 255, 0.25)',
                                        }}
                                      >
                                        {name}
                                      </Tag>
                                    ))
                                  ) : myGroup.leader_name ? (
                                    <Text strong style={{ fontSize: '15px', color: '#003a8c', display: 'block' }}>
                                      {myGroup.leader_name}
                                    </Text>
                                  ) : (
                                    <Text strong style={{ fontSize: '15px', color: '#003a8c', display: 'block' }}>
                                      未设置
                                    </Text>
                                  )}
                                </Space>
                              </div>
                            </Col>
                            <Col xs={24} sm={8}>
                              <div>
                                <Text style={{ fontSize: '12px', color: '#8c8c8c', display: 'block', marginBottom: '6px' }}>
                                  成员数量
                                </Text>
                                <Text strong style={{ fontSize: '15px', color: '#003a8c', display: 'block' }}>
                                  {myGroup.member_count} 人
                                </Text>
                              </div>
                            </Col>
                            <Col xs={24} sm={8}>
                              <div>
                                <Text style={{ fontSize: '12px', color: '#8c8c8c', display: 'block', marginBottom: '6px' }}>
                                  创建时间
                                </Text>
                                <Text strong style={{ fontSize: '15px', color: '#003a8c', display: 'block' }}>
                                  {dayjs(myGroup.created_at).format('YYYY-MM-DD')}
                                </Text>
                              </div>
                            </Col>
                          </Row>
                        </Col>
                      </Row>
                    </div>
                  ) : null}
                </>
              )}
            </Col>

            {/* 今日统计卡片：数字 + 条形进度 + 环形进度 */}
            <Col xs={24} md={isMemberOrLeader ? 10 : 24}>
              <div style={{
                background: 'rgba(255, 255, 255, 0.95)',
                borderRadius: '12px',
                padding: '16px',
                border: '1px solid rgba(24, 144, 255, 0.15)',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.05)',
                height: '100%',
              }}>
                <Row gutter={[12, 12]} align="middle">
                  <Col xs={24} sm={16}>
                    <Row gutter={[8, 8]}>
                      <Col span={8}>
                        <div style={{ textAlign: 'center' }}>
                          <Statistic
                            title={<span style={{ fontSize: 11, color: '#0050b3', fontWeight: 500 }}>待办</span>}
                            value={todayStats.totalPending}
                            valueStyle={{ fontSize: 20, color: '#d46b08', fontWeight: 700 }}
                          />
                        </div>
                      </Col>
                      <Col span={8}>
                        <div style={{ textAlign: 'center' }}>
                          <Statistic
                            title={<span style={{ fontSize: 11, color: '#0050b3', fontWeight: 500 }}>完成</span>}
                            value={todayStats.totalCompleted}
                            valueStyle={{ fontSize: 20, color: '#389e0d', fontWeight: 700 }}
                          />
                        </div>
                      </Col>
                      <Col span={8}>
                        <div style={{ textAlign: 'center' }}>
                          <Statistic
                            title={<span style={{ fontSize: 11, color: '#0050b3', fontWeight: 500 }}>进度</span>}
                            value={todayStats.todayProgress}
                            suffix="%"
                            valueStyle={{ fontSize: 20, color: '#0050b3', fontWeight: 700 }}
                          />
                        </div>
                      </Col>
                    </Row>
                    <Progress
                      percent={todayStats.todayProgress}
                      size="small"
                      strokeColor={{
                        '0%': '#1890ff',
                        '100%': '#52c41a',
                      }}
                      showInfo={false}
                      style={{ marginTop: '12px' }}
                      trailColor="rgba(24, 144, 255, 0.1)"
                    />
                  </Col>
                  <Col xs={24} sm={8} style={{ textAlign: 'center' }}>
                    <Progress
                      type="dashboard"
                      percent={todayStats.todayProgress}
                      size={88}
                      strokeColor={{ '0%': '#1890ff', '100%': '#52c41a' }}
                      trailColor="rgba(24, 144, 255, 0.12)"
                      format={(p) => (
                        <span style={{ fontSize: 13, color: '#0050b3', fontWeight: 600 }}>{p}%</span>
                      )}
                    />
                    <Text style={{ fontSize: 11, color: '#8c8c8c', display: 'block', marginTop: 4 }}>今日完成占比</Text>
                  </Col>
                </Row>
              </div>
            </Col>
          </Row>
        </div>
      </Card>
    )
  }, [user, greeting, achievement, contributionDays, todayStats, isMemberOrLeader, groupLoading, groupError, myGroup, currentRole?.role, currentTime])

  // 查找模块（使用 useMemo 优化）
  const overviewStatsModule = useMemo(
    () => otherModules.find(m => m.id === 'overview_stats'),
    [otherModules]
  )
  
  const detailStatsModule = useMemo(
    () => otherModules.find(m => m.id === 'detail_stats'),
    [otherModules]
  )
  
  const todoCenterModule = useMemo(
    () => otherModules.find(m => m.id === 'todo_center'),
    [otherModules]
  )

  return (
    <div style={{ position: 'relative', padding: '0', maxWidth: '100%' }}>
      {/* 错误提示 */}
      {error != null && (
        <Alert
          message="数据加载失败"
          description={error instanceof Error ? error.message : String(error) || '获取统计数据时发生错误，请稍后刷新页面重试'}
          type="error"
          showIcon
          closable
          style={{ marginBottom: 20 }}
        />
      )}

      {/* 欢迎模块 - 全宽显示 */}
      {welcomeModule && welcomeModuleContent && (
        <div style={{ marginBottom: 20 }}>
          {welcomeModuleContent}
        </div>
      )}

      {/* 其他模块 - 使用网格布局 */}
      {otherModules.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* 概览统计 - 全宽显示 */}
          {overviewStatsModule && (
            <div>
              <OverviewStatistics data={statistics} loading={isLoading} />
            </div>
          )}
          
          {/* 详细统计和待办中心 - 并排显示 */}
          {(detailStatsModule || todoCenterModule) && (
            <Row gutter={[20, 20]}>
              {detailStatsModule && (
                <Col xs={24} lg={12}>
                  <DetailStatistics data={statistics} loading={isLoading} />
                </Col>
              )}
              {todoCenterModule && (
                <Col xs={24} lg={12}>
                  <TodoCenter maxItems={8} />
                </Col>
              )}
            </Row>
          )}
        </div>
      )}

      {/* 布局设置浮动按钮 */}
      <FloatButton
        icon={<SettingOutlined />}
        type="primary"
        style={{ right: 24, bottom: 24 }}
        onClick={() => setSettingsVisible(true)}
        tooltip="布局设置"
      />

      {/* 布局设置弹窗 */}
      <DashboardLayoutSettings
        open={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        onConfigChange={handleConfigChange}
      />
    </div>
  )
}

export default Dashboard
