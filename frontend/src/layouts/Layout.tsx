/**
 * 主布局组件（antd Layout + Sider + Header + Content + Menu，路由仍为 React Router）
 */
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  Layout as AntLayout,
  Menu,
  Avatar,
  Dropdown,
  Space,
  Typography,
  Button,
  theme,
} from 'antd'
import {
  DashboardOutlined,
  SolutionOutlined,
  CalendarOutlined,
  DollarOutlined,
  LogoutOutlined,
  UserOutlined,
  TeamOutlined,
  CloudServerOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SettingOutlined,
  BarChartOutlined,
  CheckSquareOutlined,
  FileSearchOutlined,
  HistoryOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons'
import { useAuth } from '../contexts/AuthContext'
import { UserRoleLabels } from '../types/user'
import { uploadService } from '../services/upload'
import { optionConfigService } from '../services/optionConfig'
import NotificationIcon from '../components/NotificationIcon'
import { RoleSwitcher } from '../components/RoleSwitcher'
import NetworkStatusBanner from '../components/NetworkStatusBanner'
import type { MenuProps } from 'antd'
import { useMemo, useState } from 'react'
import { useQuery } from 'react-query'

const { Text } = Typography

const { Header, Sider, Content } = AntLayout

const SIDER_WIDTH = 180
const SIDER_COLLAPSED_WIDTH = 72

const BASE_MENU_ITEMS: MenuProps['items'] = [
  {
    key: '/',
    icon: <DashboardOutlined />,
    label: '工作台',
  },
  {
    key: '/statistics',
    icon: <BarChartOutlined />,
    label: '数据统计',
  },
  {
    key: '/tasks',
    icon: <CheckSquareOutlined />,
    label: '任务管理',
  },
  {
    key: '/work-orders',
    icon: <SolutionOutlined />,
    label: '工单管理',
  },
  {
    key: '/visit-logs',
    icon: <CalendarOutlined />,
    label: '线索维护',
  },
  {
    key: '/opportunities',
    icon: <DollarOutlined />,
    label: '商机管理',
  },
  {
    key: '/reviews',
    icon: <FileSearchOutlined />,
    label: '复盘管理',
  },
]

const MANAGER_MENU_ITEMS: MenuProps['items'] = [
  {
    key: '/users',
    icon: <UserOutlined />,
    label: '用户管理',
  },
  {
    key: '/groups',
    icon: <TeamOutlined />,
    label: '组管理',
  },
  {
    key: '/audit-logs',
    icon: <HistoryOutlined />,
    label: '操作日志',
  },
  {
    key: '/option-configs',
    icon: <UnorderedListOutlined />,
    label: '选项配置',
  },
]

/** 子路由也能命中对应侧栏项；根路径 / 仅精确匹配 */
function getSelectedMenuKey(pathname: string, menuKeys: string[]): string {
  const sorted = [...menuKeys].sort((a, b) => b.length - a.length)
  for (const key of sorted) {
    if (key === '/') {
      if (pathname === '/') return '/'
      continue
    }
    if (pathname === key || pathname.startsWith(`${key}/`)) {
      return key
    }
  }
  return pathname
}

const Layout = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { token } = theme.useToken()
  const { user, logout, getCurrentRole } = useAuth()
  const [collapsed, setCollapsed] = useState(false)

  const currentRole = getCurrentRole()
  const currentRoleValue = currentRole?.role || user?.role
  const { data: memberMenuVisibility } = useQuery(
    ['member-menu-visibility'],
    () => optionConfigService.getMemberMenuVisibility(),
    {
      enabled: currentRoleValue !== 'manager',
      staleTime: 30000,
    }
  )

  const menuItems: MenuProps['items'] = useMemo(
    () => {
      let baseItems = [...BASE_MENU_ITEMS]
      if (currentRoleValue && currentRoleValue !== 'manager') {
        const visibilityMap = new Map(
          (memberMenuVisibility?.items || []).map((item) => [item.menu_key, item.is_visible])
        )
        baseItems = baseItems.filter((item) => {
          if (!item || typeof item !== 'object' || !('key' in item) || item.key == null) {
            return true
          }
          const key = String(item.key)
          const isVisible = visibilityMap.get(key)
          return isVisible !== false
        })
      }
      return [...baseItems, ...(currentRoleValue === 'manager' ? MANAGER_MENU_ITEMS : [])]
    },
    [currentRoleValue, memberMenuVisibility]
  )

  const menuKeys = useMemo(() => {
    const keys: string[] = []
    const walk = (items: MenuProps['items']) => {
      if (!items) return
      for (const item of items) {
        if (!item || typeof item !== 'object') continue
        if ('type' in item && item.type === 'divider') continue
        if ('key' in item && item.key != null) {
          keys.push(String(item.key))
        }
      }
    }
    walk(menuItems)
    return keys
  }, [menuItems])

  const selectedMenuKey = useMemo(
    () => getSelectedMenuKey(location.pathname, menuKeys),
    [location.pathname, menuKeys]
  )

  const userMenuItems: MenuProps['items'] = [
    {
      key: '/profile',
      icon: <SettingOutlined />,
      label: '个人中心',
      onClick: () => {
        navigate('/profile')
      },
    },
    {
      type: 'divider',
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      danger: true,
      onClick: () => {
        logout()
        navigate('/login')
      },
    },
  ]

  const handleMenuClick: MenuProps['onClick'] = (e) => {
    navigate(e.key)
  }

  const isDashboardHome = location.pathname === '/'

  return (
    <>
      <NetworkStatusBanner />
      <AntLayout
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'stretch',
        }}
      >
        <Sider
          width={SIDER_WIDTH}
          collapsedWidth={SIDER_COLLAPSED_WIDTH}
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          trigger={null}
          theme="light"
          style={{
            height: '100vh',
            position: 'sticky',
            top: 0,
            left: 0,
            flexShrink: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '2px 0 8px rgba(0, 0, 0, 0.06)',
            zIndex: 100,
          }}
        >
          <div
            style={{
              height: 64,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'flex-start',
              padding: collapsed ? 0 : '0 16px',
              borderBottom: `1px solid ${token.colorSplit}`,
              background: 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)',
            }}
          >
            {!collapsed && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 8,
                    background: 'linear-gradient(135deg, #1890ff 0%, #36cfc9 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#fff',
                    fontSize: 18,
                  }}
                >
                  <CloudServerOutlined />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: token.colorText, lineHeight: 1.2 }}>
                    FDE支撑系统
                  </div>
                  <div style={{ fontSize: 10, color: token.colorTextSecondary, lineHeight: 1.2 }}>
                    AI Store
                  </div>
                </div>
              </div>
            )}
            {collapsed && (
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  background: 'linear-gradient(135deg, #1890ff 0%, #36cfc9 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontSize: 18,
                }}
              >
                <CloudServerOutlined />
              </div>
            )}
          </div>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <Menu
              mode="inline"
              theme="light"
              selectedKeys={[selectedMenuKey]}
              items={menuItems}
              onClick={handleMenuClick}
              style={{
                flex: 1,
                borderRight: 0,
                padding: '6px 0',
                overflow: 'auto',
              }}
            />
          </div>
        </Sider>

        <AntLayout
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            background: token.colorBgLayout,
          }}
        >
          <Header
            style={{
              flexShrink: 0,
              background: token.colorBgContainer,
              padding: '0 24px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderBottom: `1px solid ${token.colorSplit}`,
              boxShadow: token.boxShadowTertiary,
              height: 64,
              /* ant-layout-header 默认 line-height: 64px，多行标题 + flex 时会把文字顶出可视区域 */
              lineHeight: 'normal',
              position: 'sticky',
              top: 0,
              zIndex: 99,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                minWidth: 0,
              }}
            >
              <Button
                type="text"
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={() => setCollapsed((c) => !c)}
                aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
                style={{ color: token.colorTextSecondary, flexShrink: 0 }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2, minWidth: 0 }}>
                <Text strong style={{ fontSize: 18, lineHeight: 1.35, margin: 0, color: token.colorText }}>
                  AI Store FDE支撑系统
                </Text>
                <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.35, margin: 0 }}>
                  FDE支撑系统
                </Text>
              </div>
            </div>

            <Space size="large" align="center">
              <NotificationIcon />
              <RoleSwitcher />
              <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
                <Space
                  size={12}
                  style={{
                    cursor: 'pointer',
                    padding: '8px 12px',
                    borderRadius: token.borderRadiusLG,
                    transition: `background ${token.motionDurationMid}`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = token.colorFillAlter
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <Avatar
                    size={40}
                    src={user?.avatar ? uploadService.getAvatarUrl(user.avatar) : undefined}
                    style={{
                      background: user?.avatar
                        ? 'transparent'
                        : 'linear-gradient(135deg, #1890ff 0%, #36cfc9 100%)',
                      border: `2px solid ${token.colorBgContainer}`,
                      boxShadow: '0 2px 8px rgba(24, 144, 255, 0.3)',
                    }}
                    icon={!user?.avatar ? <UserOutlined /> : undefined}
                    onError={() => false}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                    <Text strong style={{ fontSize: 14, color: token.colorText }}>
                      {user?.real_name}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {UserRoleLabels[currentRoleValue as keyof typeof UserRoleLabels] || currentRoleValue}
                    </Text>
                  </div>
                </Space>
              </Dropdown>
            </Space>
          </Header>

          <Content
            style={{
              flex: 1,
              minHeight: 0,
              overflow: 'auto',
              margin: 16,
              padding: isDashboardHome ? 16 : 20,
              background: isDashboardHome ? '#f5f7fa' : token.colorBgContainer,
              borderRadius: isDashboardHome ? token.borderRadiusLG : 0,
            }}
          >
            <Outlet />
          </Content>
        </AntLayout>
      </AntLayout>
    </>
  )
}

export default Layout
