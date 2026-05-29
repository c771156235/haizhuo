/**
 * 登录页面
 */
import { useState, useEffect, useRef } from 'react'
import { Form, Input, Button, Card, message, Typography, Space, Alert, Modal } from 'antd'
import { UserOutlined, LockOutlined, SafetyOutlined, CloudServerOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import { useAuth } from '../contexts/AuthContext'
import { useNavigate, Link } from 'react-router-dom'
import logger from '../utils/logger'
import { authService } from '../services/auth'

const { Title, Text } = Typography

interface LoginError {
  type: 'username' | 'password' | 'disabled' | 'network' | 'locked' | 'pending' | 'rejected' | 'no_role' | 'rate_limit' | 'forbidden' | 'captcha' | 'unknown'
  message: string
  field?: 'username' | 'password' | 'captcha_answer'
}

const Login = () => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<LoginError | null>(null)
  const [form] = Form.useForm()
  const { login, getRememberedUsername } = useAuth()
  const navigate = useNavigate()
  // 使用ref防止重复提交，避免state异步更新导致的竞态问题
  const isSubmittingRef = useRef(false)
  
  // 验证码相关状态
  // 验证码相关状态
  const [captchaImage, setCaptchaImage] = useState<string>('')
  const [captchaToken, setCaptchaToken] = useState<string>('')
  const [captchaLoading, setCaptchaLoading] = useState(false)
  
  // 获取验证码函数
  const fetchCaptcha = async () => {
    setCaptchaLoading(true)
    try {
      const response = await authService.getCaptcha()
      setCaptchaImage(response.image)
      setCaptchaToken(response.captcha_token)
      // 清空验证码输入框
      form.setFieldValue('captcha_answer', '')
    } catch (error) {
      logger.error('获取验证码失败', error)
      message.error('获取验证码失败，请稍后重试')
    } finally {
      setCaptchaLoading(false)
    }
  }
  
  // 初始化时填充记住的用户名
  useEffect(() => {
    const rememberedUsername = getRememberedUsername()
    if (rememberedUsername) {
      form.setFieldsValue({ username: rememberedUsername })
      const rememberPassword = localStorage.getItem('remember_password')
      if (rememberPassword === 'true') {
        form.setFieldsValue({ remember: true })
      }
    }
    // 初始化时获取验证码
    fetchCaptcha()
  }, [form, getRememberedUsername])

  // 页面加载时添加class，卸载时移除
  useEffect(() => {
    document.body.classList.add('login-page')
    return () => {
      document.body.classList.remove('login-page')
      // 组件卸载时重置状态，防止状态泄漏
      isSubmittingRef.current = false
      setLoading(false)
    }
  }, [])

  // 验证码错误提示：展示 5 秒后自动消失
  useEffect(() => {
    if (error?.field !== 'captcha_answer') return

    const t = window.setTimeout(() => {
      setError(null)
      // 同步清理表单字段错误，避免红框/文案残留
      form.setFields([{ name: 'captcha_answer', errors: [] }])
    }, 5000)

    return () => {
      window.clearTimeout(t)
    }
  }, [error, form])

  // 提取并分类错误信息
  const extractError = (error: any): LoginError => {
    if (!error) {
      return { type: 'unknown', message: '登录失败，请稍后重试' }
    }

    // 网络错误（包括超时）
    if (!error.response) {
      if (error.request) {
        // 检查是否是超时错误
        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
          return {
            type: 'network',
            message: '请求超时，请检查网络连接后重试',
          }
        }
        return { 
          type: 'network', 
          message: '网络连接失败，请检查您的网络设置后重试',
        }
      }
      // 其他未知错误
      if (error.message) {
        return { type: 'unknown', message: error.message }
      }
      return { type: 'unknown', message: '登录失败，请稍后重试' }
    }

    const { status, data } = error.response
    let errorMessage = '登录失败，请稍后重试'

    // 提取错误消息
    if (data?.detail) {
      if (Array.isArray(data.detail)) {
        errorMessage = data.detail.map((item: any) => item.msg || JSON.stringify(item)).join('; ')
      } else if (typeof data.detail === 'string') {
        errorMessage = data.detail
      }
    }

    // 根据状态码和错误消息判断错误类型，提供用户友好的错误提示
    if (status === 400) {
      // 400 可能是验证码错误
      if (errorMessage.includes('验证码')) {
        return {
          type: 'captcha',
          message: errorMessage,
          field: 'captcha_answer'
        }
      }
    } else if (status === 401) {
      // 401 用户名或密码错误 - 这是正常的业务逻辑，不是系统错误
      return { 
        type: 'password', 
        message: errorMessage || '用户名或密码错误，请检查后重试',
        field: 'password'
      }
    } else if (status === 403) {
      // 403 根据错误消息内容提供更细致的分类和友好的提示
      if (errorMessage.includes('禁用') || errorMessage.includes('禁用')) {
        return { 
          type: 'disabled', 
          message: errorMessage || '您的账户已被禁用，请联系管理员',
        }
      } else if (errorMessage.includes('审核中') || errorMessage.includes('等待管理员审核')) {
        return {
          type: 'pending',
          message: errorMessage || '您的账号正在审核中，请等待管理员审核通过后再登录',
        }
      } else if (errorMessage.includes('审核未通过') || errorMessage.includes('审核未通过')) {
        return {
          type: 'rejected',
          message: errorMessage || '您的账号审核未通过，如有疑问请联系管理员',
        }
      } else if (errorMessage.includes('没有已审核通过的角色')) {
        return {
          type: 'no_role',
          message: errorMessage || '您没有已审核通过的角色，请联系管理员',
        }
      }
      return { 
        type: 'forbidden', 
        message: errorMessage || '您无权访问，请联系管理员'
      }
    } else if (status === 423) {
      // 423 账户锁定 - 提供友好的提示
      return {
        type: 'locked',
        message: errorMessage || '账户已被锁定，请稍后再试',
      }
    } else if (status === 422) {
      // 422 参数验证错误：根据后端返回的 loc 确定是哪个字段（如 captcha_answer 非数字会在这里报错）
      let field: 'username' | 'password' | 'captcha_answer' | undefined
      if (Array.isArray(data.detail) && data.detail.length > 0) {
        const first = data.detail[0]
        const loc = first?.loc
        if (Array.isArray(loc)) {
          const fieldName = loc[loc.length - 1]
          if (fieldName === 'captcha_answer') {
            field = 'captcha_answer'
          } else if (fieldName === 'username') {
            field = 'username'
          } else if (fieldName === 'password') {
            field = 'password'
          }
        }
      }
      return {
        type: field === 'captcha_answer' ? 'captcha' : 'username',
        message: errorMessage || (field === 'captcha_answer' ? '验证码请输入数字' : '输入格式错误，请检查后重试'),
        field: field ?? 'username'
      }
    } else if (status === 429) {
      // 429 请求过于频繁 - 提供友好的提示
      return {
        type: 'rate_limit',
        message: errorMessage || '请求过于频繁，请稍后再试',
      }
    } else if (status >= 500) {
      // 500+ 服务器错误 - 这是真正的系统错误
      return { 
        type: 'network', 
        message: '服务器暂时无法响应，请稍后重试',
      }
    }

    return { type: 'unknown', message: errorMessage || '登录失败，请稍后重试' }
  }

  const onFinish = async (values: { username: string; password: string; remember?: boolean; captcha_answer?: string }) => {
    // 防止重复提交 - 使用ref而不是state，避免异步更新导致的竞态问题
    if (isSubmittingRef.current) {
      logger.warn('登录请求正在进行中，忽略重复提交')
      return
    }
    
    // 验证验证码是否已输入
    if (!values.captcha_answer || values.captcha_answer.trim() === '') {
      setError({ type: 'captcha', message: '请输入验证码', field: 'captcha_answer' })
      form.setFields([
        { 
          name: 'captcha_answer', 
          errors: ['请输入验证码'],
        },
      ])
      // 未填写验证码时也刷新一次，避免用户继续输入旧图（token 可能已失效）
      void fetchCaptcha()
      return
    }
    // 验证码必须是数字（算术验证码答案为整数）
    const captchaNum = parseInt(values.captcha_answer, 10)
    if (Number.isNaN(captchaNum)) {
      setError({ type: 'captcha', message: '验证码请输入数字', field: 'captcha_answer' })
      form.setFields([
        { 
          name: 'captcha_answer', 
          errors: ['验证码请输入数字'],
        },
      ])
      return
    }
    
    // 设置提交标志
    isSubmittingRef.current = true
    setLoading(true)
    setError(null)
    
    // 清除之前的字段错误
    form.setFields([
      { name: 'username', errors: [] },
      { name: 'password', errors: [] },
      { name: 'captcha_answer', errors: [] },
    ])

    try {
      // 调用 AuthContext 的 login,包含验证码参数（captchaNum 已在上面校验为有效数字）
      await login(
        values.username, 
        values.password, 
        captchaToken, 
        captchaNum,
        values.remember || false
      )
      
      message.success({
        content: '登录成功，正在跳转...',
        duration: 1.5,
      })
      // 延迟跳转，让用户看到成功提示
      setTimeout(() => {
        navigate('/')
      }, 500)
    } catch (error: any) {
      const loginError = extractError(error)
      
      // 根据错误类型决定日志级别
      // 业务逻辑错误（401密码错误、403权限问题、423锁定等）是正常的，不应该记录为error
      // 只有真正的系统错误（500、网络错误等）才记录为error
      const errorStatus = error?.response?.status
      
      if (errorStatus === 401 || errorStatus === 403 || errorStatus === 423 || errorStatus === 429 || errorStatus === 400) {
        // 业务逻辑错误：密码错误、权限问题、账户锁定、请求频繁、验证码错误等
        // 使用debug级别（开发环境可见，生产环境不输出），避免控制台显示错误
        logger.debug(`登录失败：业务逻辑错误 (${errorStatus})`, { 
          status: errorStatus, 
          message: loginError.message 
        })
      } else if (errorStatus >= 500) {
        // 服务器错误是真正的系统错误
        logger.error('登录失败：服务器错误', error)
      } else if (!error?.response) {
        // 网络错误是真正的系统错误
        logger.error('登录失败：网络错误', error)
      } else {
        // 其他未知错误使用warn级别
        logger.warn('登录失败', error)
      }
      
      setError(loginError)

      // 根据错误类型设置表单字段错误状态
      if (loginError.field === 'username') {
        form.setFields([
          { 
            name: 'username', 
            errors: [loginError.message],
            value: form.getFieldValue('username')
          },
        ])
      } else if (loginError.field === 'password') {
        form.setFields([
          { 
            name: 'password', 
            errors: [loginError.message],
            value: ''
          },
        ])
        // 清空密码字段
        form.setFieldValue('password', '')
      } else if (loginError.field === 'captcha_answer') {
        form.setFields([
          { 
            name: 'captcha_answer', 
            errors: [loginError.message],
            value: ''
          },
        ])
        // 清空验证码并刷新
        form.setFieldValue('captcha_answer', '')
        fetchCaptcha()  // 自动刷新验证码
      }

      // 服务端验证码 token 一次性核销：密码错误、锁定、权限等问题也会导致旧验证码失效，需换新图
      if (
        error?.response &&
        loginError.type !== 'network' &&
        loginError.field !== 'captcha_answer'
      ) {
        form.setFieldValue('captcha_answer', '')
        void fetchCaptcha()
      }
      
      // 对于非字段错误，显示顶部提示
      // 注意：某些错误类型（如pending、rejected、no_role等）已经在Alert中显示，避免重复提示
      if (!loginError.field && 
          loginError.type !== 'disabled' && 
          loginError.type !== 'locked' &&
          loginError.type !== 'pending' &&
          loginError.type !== 'rejected' &&
          loginError.type !== 'no_role' &&
          loginError.type !== 'rate_limit' &&
          loginError.type !== 'captcha') {
        message.error(loginError.message)
      }
    } finally {
      // 确保loading状态和提交标志都被重置，即使出现意外错误
      isSubmittingRef.current = false
      setLoading(false)
    }
  }

  // 输入时清除错误状态
  const handleInputChange = () => {
    if (error) {
      setError(null)
      form.setFields([
        { name: 'username', errors: [] },
        { name: 'password', errors: [] },
        { name: 'captcha_answer', errors: [] },
      ])
    }
  }

  // 处理忘记密码点击
  const handleForgotPassword = () => {
    Modal.info({
      title: '忘记密码',
      content: (
        <div style={{ marginTop: 16 }}>
          <p style={{ marginBottom: 0, fontSize: '14px', color: '#595959' }}>
            如果您忘记了密码，请联系系统管理员（总管）为您重置密码。
          </p>
        </div>
      ),
      okText: '我知道了',
      width: 420,
    })
  }

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        overflow: 'hidden',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      }}
    >
      {/* 左侧品牌展示区域 */}
      <div
        style={{
          flex: '0 0 60%',
          background: 'linear-gradient(180deg, #e3f2fd 0%, #bbdefb 30%, #90caf9 70%, #64b5f6 100%)',
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '80px 60px',
          overflow: 'hidden',
        }}
      >
        {/* 背景装饰 - 柔和的几何图形 */}
        <div
          style={{
            position: 'absolute',
            top: '-15%',
            right: '-8%',
            width: '500px',
            height: '500px',
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.4)',
            filter: 'blur(80px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-12%',
            left: '-8%',
            width: '450px',
            height: '450px',
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.35)',
            filter: 'blur(70px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: '35%',
            left: '15%',
            width: '250px',
            height: '250px',
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.3)',
            filter: 'blur(60px)',
          }}
        />

        {/* Logo 和品牌信息 */}
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            textAlign: 'center',
            color: '#1976d2',
            width: '100%',
            maxWidth: '500px',
          }}
        >
          {/* Logo 图标 */}
          <div
            style={{
              width: '100px',
              height: '100px',
              margin: '0 auto 48px',
              borderRadius: '20px',
              background: 'rgba(25, 118, 210, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 24px rgba(25, 118, 210, 0.2), inset 0 2px 8px rgba(255, 255, 255, 0.5)',
              border: '1px solid rgba(255, 255, 255, 0.6)',
              backdropFilter: 'blur(10px)',
            }}
          >
            <CloudServerOutlined style={{ fontSize: '56px', color: '#1976d2' }} />
          </div>

          {/* 主标题 */}
          <Title
            level={1}
            style={{
              color: '#1565c0',
              fontSize: '56px',
              fontWeight: 700,
              marginBottom: '16px',
              letterSpacing: '1px',
              textShadow: '0 2px 8px rgba(255, 255, 255, 0.8)',
            }}
          >
            AI Store FDE
          </Title>

          {/* 副标题 */}
          <div
            style={{
              fontSize: '22px',
              color: '#1976d2',
              marginBottom: '100px',
              fontWeight: 500,
              letterSpacing: '0.5px',
            }}
          >
            支撑系统
          </div>

          {/* 宣传文字卡片 */}
          <div
            style={{
              marginTop: 'auto',
              padding: '32px 40px',
              background: 'rgba(255, 255, 255, 0.6)',
              backdropFilter: 'blur(12px)',
              borderRadius: '16px',
              border: '1px solid rgba(255, 255, 255, 0.8)',
              boxShadow: '0 8px 32px rgba(25, 118, 210, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.8)',
            }}
          >
            <div
              style={{
                fontSize: '22px',
                color: '#1565c0',
                marginBottom: '12px',
                fontWeight: 600,
                lineHeight: '1.6',
              }}
            >
              数智化引领企业办公场景变革
            </div>
            <div
              style={{
                fontSize: '14px',
                color: '#1976d2',
                fontWeight: 400,
                lineHeight: '1.6',
                letterSpacing: '0.3px',
                opacity: 0.85,
              }}
            >
              Digital Intelligence Leading the Reformation of Corporate Office Settings
            </div>
          </div>
        </div>
      </div>

      {/* 右侧登录表单区域 */}
      <div
        style={{
          flex: '0 0 40%',
          background: '#f5f7fa',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '40px',
          position: 'relative',
        }}
      >
        {/* 背景装饰 */}
        <div
          style={{
            position: 'absolute',
            top: '-50px',
            right: '-50px',
            width: '300px',
            height: '300px',
            background: 'rgba(24, 144, 255, 0.03)',
            borderRadius: '50%',
            filter: 'blur(40px)',
          }}
        />

        <Card
          style={{
            width: '100%',
            maxWidth: '420px',
            borderRadius: '16px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.08)',
            border: 'none',
            position: 'relative',
            zIndex: 1,
          }}
          styles={{ body: { padding: '32px 40px' } }}
        >
          {/* 表单标题 */}
          <div style={{ marginBottom: '28px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <Title
                level={3}
                style={{
                  margin: 0,
                  fontWeight: 600,
                  color: '#1a1a1a',
                  fontSize: '24px',
                }}
              >
                账号登录
              </Title>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '6px',
                  background: '#f0f0f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
                title="扫码登录"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <rect x="2" y="2" width="6" height="6" fill="#8c8c8c" />
                  <rect x="10" y="2" width="6" height="6" fill="#8c8c8c" />
                  <rect x="2" y="10" width="6" height="6" fill="#8c8c8c" />
                  <rect x="10" y="10" width="2" height="2" fill="#8c8c8c" />
                  <rect x="14" y="10" width="2" height="2" fill="#8c8c8c" />
                  <rect x="10" y="14" width="2" height="2" fill="#8c8c8c" />
                  <rect x="14" y="14" width="2" height="2" fill="#8c8c8c" />
                </svg>
              </div>
            </div>
            <Text type="secondary" style={{ fontSize: '14px', color: '#8c8c8c' }}>
              工单管理和商机跟踪系统
            </Text>
          </div>

        {/* 错误提示 Alert（用于非字段错误） */}
        {error && !error.field && (
          <Alert
            message={error.message}
            type="error"
            showIcon
            icon={<ExclamationCircleOutlined />}
            closable
            onClose={() => {
              setError(null)
            }}
            style={{
              marginBottom: '20px',
              borderRadius: '10px',
              border: '1px solid #ffccc7',
              background: '#fff2f0',
            }}
          />
        )}

        {/* 登录表单 */}
        <Form
          form={form}
          name="login"
          onFinish={onFinish}
          onFinishFailed={(info) => {
            const captchaMissing = (info?.errorFields || []).some((f) => {
              const name = Array.isArray(f.name) ? f.name[0] : f.name
              return name === 'captcha_answer'
            })
            if (captchaMissing) {
              setError({ type: 'captcha', message: '请输入验证码', field: 'captcha_answer' })
              void fetchCaptcha()
            }
          }}
          autoComplete="off"
          size="large"
          layout="vertical"
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入账号' }]}
            style={{ marginBottom: '16px' }}
            validateStatus={error?.field === 'username' ? 'error' : ''}
            help={error?.field === 'username' ? error.message : ''}
          >
            <div>
              <div style={{ marginBottom: '8px', fontSize: '14px', color: '#595959', fontWeight: 500 }}>
                账号
              </div>
              <Input
                prefix={
                  <UserOutlined 
                    style={{ 
                      color: error?.field === 'username' ? '#ff4d4f' : '#8c8c8c',
                      transition: 'color 0.3s'
                    }} 
                  />
                }
                placeholder="请输入账号"
                onChange={handleInputChange}
                allowClear
                style={{
                  height: '44px',
                  borderRadius: '8px',
                  fontSize: '15px',
                  border: error?.field === 'username' 
                    ? '1.5px solid #ff4d4f' 
                    : '1.5px solid #d9d9d9',
                  transition: 'all 0.3s',
                }}
                onFocus={(e) => {
                  const borderColor = error?.field === 'username' ? '#ff4d4f' : '#1890ff'
                  e.target.style.borderColor = borderColor
                  e.target.style.boxShadow = error?.field === 'username'
                    ? '0 0 0 2px rgba(255, 77, 79, 0.1)'
                    : '0 0 0 2px rgba(24, 144, 255, 0.1)'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = error?.field === 'username' 
                    ? '#ff4d4f' 
                    : '#d9d9d9'
                  e.target.style.boxShadow = 'none'
                }}
              />
            </div>
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
            style={{ marginBottom: '20px' }}
            validateStatus={error?.field === 'password' ? 'error' : ''}
            help={error?.field === 'password' ? error.message : ''}
          >
            <div>
              <div style={{ marginBottom: '8px', fontSize: '14px', color: '#595959', fontWeight: 500 }}>
                密码
              </div>
              <Input.Password
                prefix={
                  <LockOutlined 
                    style={{ 
                      color: error?.field === 'password' ? '#ff4d4f' : '#8c8c8c',
                      transition: 'color 0.3s'
                    }} 
                  />
                }
                placeholder="请输入密码"
                onChange={handleInputChange}
                style={{
                  height: '44px',
                  borderRadius: '8px',
                  fontSize: '15px',
                  border: error?.field === 'password' 
                    ? '1.5px solid #ff4d4f' 
                    : '1.5px solid #d9d9d9',
                  transition: 'all 0.3s',
                }}
                onFocus={(e) => {
                  const borderColor = error?.field === 'password' ? '#ff4d4f' : '#1890ff'
                  e.target.style.borderColor = borderColor
                  e.target.style.boxShadow = error?.field === 'password'
                    ? '0 0 0 2px rgba(255, 77, 79, 0.1)'
                    : '0 0 0 2px rgba(24, 144, 255, 0.1)'
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = error?.field === 'password' 
                    ? '#ff4d4f' 
                    : '#d9d9d9'
                  e.target.style.boxShadow = 'none'
                }}
              />
            </div>
          </Form.Item>

          {/* 验证码输入框 */}
          <Form.Item
            style={{ marginBottom: '20px' }}
          >
            <div>
              <div style={{ marginBottom: '8px', fontSize: '14px', color: '#595959', fontWeight: 500 }}>
                验证码
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                {/* 验证码输入框 */}
                <Form.Item
                  name="captcha_answer"
                  rules={[{ required: true, message: '请输入验证码' }]}
                  style={{ flex: 1, marginBottom: 0 }}
                  validateStatus={error?.field === 'captcha_answer' ? 'error' : undefined}
                  // 始终渲染同高度的 explain 区域，避免布局跳动；无错误时隐藏占位
                  help={
                    error?.field === 'captcha_answer'
                      ? error.message
                      : <span style={{ visibility: 'hidden' }}>占位</span>
                  }
                >
                  <Input
                    placeholder="请输入结果"
                    onChange={handleInputChange}
                    maxLength={2}
                    style={{
                      height: '44px',
                      borderRadius: '8px',
                      fontSize: '15px',
                      border: error?.field === 'captcha_answer'
                        ? '1.5px solid #ff4d4f'
                        : '1.5px solid #d9d9d9',
                      transition: 'all 0.3s',
                    }}
                    onFocus={(e) => {
                      const borderColor = error?.field === 'captcha_answer' ? '#ff4d4f' : '#1890ff'
                      e.target.style.borderColor = borderColor
                      e.target.style.boxShadow = error?.field === 'captcha_answer'
                        ? '0 0 0 2px rgba(255, 77, 79, 0.1)'
                        : '0 0 0 2px rgba(24, 144, 255, 0.1)'
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = error?.field === 'captcha_answer'
                        ? '#ff4d4f'
                        : '#d9d9d9'
                      e.target.style.boxShadow = 'none'
                    }}
                  />
                </Form.Item>
                
                {/* 验证码图片 */}
                <div
                  style={{
                    width: '120px',
                    height: '44px',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    border: '1.5px solid #d9d9d9',
                    background: '#f5f5f5',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                  }}
                  onClick={fetchCaptcha}
                  title="点击刷新验证码"
                >
                  {captchaLoading ? (
                    <span style={{ fontSize: '12px', color: '#8c8c8c' }}>加载中...</span>
                  ) : captchaImage ? (
                    <img 
                      src={captchaImage} 
                      alt="验证码" 
                      style={{ 
                        width: '100%', 
                        height: '100%', 
                        objectFit: 'cover' 
                      }} 
                    />
                  ) : (
                    <span style={{ fontSize: '12px', color: '#8c8c8c' }}>加载失败</span>
                  )}
                </div>
              </div>
            </div>
          </Form.Item>

          {/* 记住密码和忘记密码 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <Form.Item name="remember" valuePropName="checked" style={{ marginBottom: 0 }}>
              <Space>
                <input
                  type="checkbox"
                  id="remember"
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="remember" style={{ fontSize: '14px', color: '#595959', cursor: 'pointer' }}>
                  记住用户名
                </label>
              </Space>
            </Form.Item>
            <Button 
              type="link" 
              style={{ padding: 0, fontSize: '14px', height: 'auto' }}
              onClick={handleForgotPassword}
            >
              忘记密码？
            </Button>
          </div>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button
              type="primary"
              htmlType="submit"
              block
              loading={loading}
              disabled={loading}
              style={{
                height: '48px',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 500,
                background: 'linear-gradient(135deg, #1890ff 0%, #36cfc9 100%)',
                border: 'none',
                boxShadow: '0 4px 12px rgba(24, 144, 255, 0.3)',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.transform = 'translateY(-1px)'
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba(24, 144, 255, 0.4)'
                }
              }}
              onMouseLeave={(e) => {
                if (!loading) {
                  e.currentTarget.style.transform = 'translateY(0)'
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(24, 144, 255, 0.3)'
                }
              }}
            >
              {loading ? '登录中...' : '登录'}
            </Button>
          </Form.Item>
        </Form>

        {/* 注册链接 */}
        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <Text type="secondary" style={{ fontSize: '14px' }}>
            还没有账号？{' '}
            <Link to="/register" style={{ color: '#1890ff' }}>
              立即注册
            </Link>
          </Text>
        </div>

        {/* 底部安全提示 */}
        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <Space size="small" style={{ color: '#8c8c8c' }}>
            <SafetyOutlined style={{ color: '#52c41a', fontSize: '14px' }} />
            <Text type="secondary" style={{ fontSize: '13px' }}>
              安全登录，保护您的账户安全
            </Text>
          </Space>
        </div>
      </Card>
    </div>
    </div>
  )
}

export default Login

