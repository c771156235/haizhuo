/**
 * 认证上下文
 */
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { authService, User, UserRoleInfo } from '../services/auth'

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (username: string, password: string, captchaToken: string, captchaAnswer: number, remember?: boolean) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
  switchRole: (roleId: number) => Promise<void>
  isAuthenticated: boolean
  getRememberedUsername: () => string | null
  getCurrentRole: () => UserRoleInfo | null
  getAvailableRoles: () => UserRoleInfo[]
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    // 如果 context 为 undefined，说明组件不在 AuthProvider 内部
    // 这是一个严重的配置错误，必须抛出错误
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: ReactNode
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // 初始化时检查 token 并获取用户信息
  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      authService
        .getCurrentUser()
        .then((userData) => {
          // 调试日志：检查返回的用户数据
          if (process.env.NODE_ENV === 'development') {
            console.log('getCurrentUser返回的数据:', {
              userData,
              current_role: userData.current_role,
              roles: userData.roles,
              role: userData.role
            })
          }
          setUser(userData)
          setLoading(false)
        })
        .catch(() => {
          // 清除无效的 token
          localStorage.removeItem('token')
          localStorage.removeItem('refresh_token')
          setUser(null)
          setLoading(false)
        })
    } else {
      setLoading(false)
    }
  }, [])
  
  // 确保 context value 始终存在，即使在加载期间
  // 这样可以避免在 React StrictMode 下的时序问题
  
  const getRememberedUsername = () => {
    return localStorage.getItem('remembered_username')
  }

  const login = async (username: string, password: string, captchaToken: string, captchaAnswer: number, remember: boolean = false) => {
    try {
      const response = await authService.login({ 
        username, 
        password,
        captcha_token: captchaToken,
        captcha_answer: captchaAnswer
      })
      localStorage.setItem('token', response.access_token)
      localStorage.setItem('refresh_token', response.refresh_token)
      
      // 如果选择记住密码，保存用户名（不保存密码）
      if (remember) {
        localStorage.setItem('remembered_username', username)
        localStorage.setItem('remember_password', 'true')
      } else {
        localStorage.removeItem('remembered_username')
        localStorage.removeItem('remember_password')
      }
      
      // 获取用户信息，如果失败则清除token并重新抛出异常
      try {
        const userData = await authService.getCurrentUser()
        // 如果登录响应中包含角色信息，使用它
        if (response.roles && response.current_role) {
          userData.roles = response.roles
          userData.current_role = response.current_role
        }
        setUser(userData)
      } catch (error) {
        // 如果获取用户信息失败，清除token并重新抛出异常
        localStorage.removeItem('token')
        localStorage.removeItem('refresh_token')
        throw error
      }
    } catch (error) {
      // 确保所有错误都被抛出，让调用者处理
      throw error
    }
  }

  const switchRole = async (roleId: number) => {
    try {
      const response = await authService.switchRole(roleId)
      localStorage.setItem('token', response.access_token)
      localStorage.setItem('refresh_token', response.refresh_token)
      
      // 更新用户信息
      const userData = await authService.getCurrentUser()
      if (response.roles && response.current_role) {
        userData.roles = response.roles
        userData.current_role = response.current_role
      }
      setUser(userData)
    } catch (error) {
      throw error
    }
  }

  const getCurrentRole = (): UserRoleInfo | null => {
    if (!user) return null
    
    // 优先使用current_role（当前激活的角色）
    if (user.current_role) {
      if (process.env.NODE_ENV === 'development') {
        console.log('getCurrentRole: 使用current_role', user.current_role)
      }
      return user.current_role
    }
    
    // 如果没有current_role，尝试从roles数组中查找is_current为true的角色
    if (user.roles && user.roles.length > 0) {
      const currentRoleFromArray = user.roles.find(r => r.is_current === true)
      if (currentRoleFromArray) {
        if (process.env.NODE_ENV === 'development') {
          console.log('getCurrentRole: 从roles数组中找到is_current角色', currentRoleFromArray)
        }
        return currentRoleFromArray
      }
      // 如果没有找到is_current为true的角色，使用第一个已审核通过的角色
      const approvedRole = user.roles.find(r => r.approval_status === 'approved' && r.is_active)
      if (approvedRole) {
        if (process.env.NODE_ENV === 'development') {
          console.log('getCurrentRole: 使用第一个已审核通过的角色', approvedRole)
        }
        return approvedRole
      }
    }
    
    // 向后兼容：如果用户表中还有role字段（单角色用户）
    if (user.role) {
      if (process.env.NODE_ENV === 'development') {
        console.log('getCurrentRole: 使用向后兼容的user.role', user.role)
      }
      return {
        id: 0,
        role: user.role,
        sales_unit: user.sales_unit,
        is_current: true,
        is_active: true,
        approval_status: 'approved',
        created_at: user.created_at
      }
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.warn('getCurrentRole: 无法获取当前角色', { user })
    }
    return null
  }

  const getAvailableRoles = (): UserRoleInfo[] => {
    if (!user) return []
    // 返回所有已审核通过的角色
    return (user.roles || []).filter(role => 
      role.approval_status === 'approved' && role.is_active
    )
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('refresh_token')
    // 清除记住密码状态，但保留用户名（如果之前选择了记住）
    const rememberPassword = localStorage.getItem('remember_password')
    if (!rememberPassword) {
      localStorage.removeItem('remembered_username')
    }
    setUser(null)
  }

  const refreshUser = async () => {
    const token = localStorage.getItem('token')
    if (token) {
      try {
        const userData = await authService.getCurrentUser()
        setUser(userData)
      } catch (error) {
        localStorage.removeItem('token')
        localStorage.removeItem('refresh_token')
        setUser(null)
      }
    }
  }

  // 直接提供 context value，确保始终存在
  // 注意：每次渲染都会创建新对象，但这通常是可接受的（除非导致性能问题）
  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        refreshUser,
        switchRole,
        isAuthenticated: !!user,
        getRememberedUsername,
        getCurrentRole,
        getAvailableRoles,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

