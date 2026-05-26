/**
 * 用户注册页面
 */
import { useState, useRef, useEffect } from 'react'
import { Form, Input, Button, Card, message, Typography, Space, Alert, Steps, Select, Tag } from 'antd'
import { UserOutlined, LockOutlined, MailOutlined, PhoneOutlined, SafetyOutlined, CloudServerOutlined, CheckCircleOutlined, CloseCircleOutlined, PlusOutlined } from '@ant-design/icons'
import { useNavigate, Link } from 'react-router-dom'
import { registerService } from '../services/auth'
import { logError, extractErrorMessage as extractErrorMsg } from '../utils/errorHandler'
import { trimFormString } from '../utils/formNormalize'

const { Title, Text } = Typography

// 部门数据结构
const departments = {
  '云能力中心': null,
  '海卓': null,
  '阿网': null,
  '恒联': null,
  '政企群': null,
  '商客部': null,
  '销售单位': [
    '东区',
    '中区',
    '西区',
    '北区',
    '金山',
    '浦东',
    '公共BD',
    '互联网部',
    '政务BD',
    '科创BD（含号百）',
    '南区',
    '莘闵',
    '青浦',
    '嘉定',
    '松江',
    '数集',
    '工商BD',
    '金融BD',
    '崇明',
    '奉贤',
    '战略BD',
    '互联网BD/信网部',
    '宝山',
    '理想公司',
    '云舟'
  ]
}

const Register = () => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [current, setCurrent] = useState(0)
  const [usernameChecking, setUsernameChecking] = useState(false)
  const [usernameStatus, setUsernameStatus] = useState<'checking' | 'available' | 'unavailable' | null>(null)
  const [usernameMessage, setUsernameMessage] = useState<string>('')
  const checkTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [form] = Form.useForm()
  const navigate = useNavigate()
  
  // 保存表单数据，确保在分步骤表单中不丢失
  const [formData, setFormData] = useState<Record<string, any>>({})
  
  // 部门选择相关状态
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null)
  // @ts-ignore - setter is used but value is not read
  const [selectedSubDepartment, setSelectedSubDepartment] = useState<string | null>(null)
  
  // 多角色相关状态
  const [roles, setRoles] = useState<Array<{ role: string; sales_unit?: string }>>([])
  const [currentRoleForm, setCurrentRoleForm] = useState<{ role: string }>({ role: '' })

  const steps = [
    {
      title: '基本信息',
      content: 'basic',
    },
    {
      title: '联系信息',
      content: 'contact',
    },
    {
      title: '密码设置',
      content: 'password',
    },
  ]

  const onFinish = async () => {
    // 在最后一步提交时，先验证所有字段
    if (current !== steps.length - 1) {
      return
    }

    // 防止重复提交
    if (loading) {
      return
    }

    setLoading(true)
    setError(null)

    try {
      // 获取当前表单值，检查部门选择情况
      const currentValues = form.getFieldsValue()
      const department = currentValues.department || formData.department
      
      // 构建验证字段列表
      const fieldsToValidate: string[] = [
        'username',
        'real_name',
        'role',
        'email',
        'phone',
        'department',
        'password',
        'confirm_password'
      ]
      
      // 如果选择了一级部门且有二级部门，也需要验证二级部门
      if (department && departments[department as keyof typeof departments]) {
        fieldsToValidate.push('sub_department')
      }
      
      // 明确指定要验证的所有字段（包括前面步骤的字段）
      await form.validateFields(fieldsToValidate)
      
      // 获取所有字段的值
      // 先获取当前步骤的字段值
      const currentStepValues = form.getFieldsValue()
      // 合并保存的表单数据和当前步骤的数据
      const allValues = { ...formData, ...currentStepValues }
      
      // 确保sales_unit字段被正确设置
      if (!allValues.sales_unit) {
        const dept = allValues.department
        if (dept) {
          if (departments[dept as keyof typeof departments] === null) {
            // 没有二级部门，直接使用一级部门
            allValues.sales_unit = dept
          } else if (allValues.sub_department) {
            // 有二级部门，组合一级和二级部门
            allValues.sales_unit = `${dept} - ${allValues.sub_department}`
          }
        }
      }
      
      // 调试：打印获取到的值
      console.log('Form values before processing:', {
        formData,
        currentStepValues,
        allValues
      })
      
      // 检查是否有角色
      if (roles.length === 0) {
        message.error('请至少添加一个角色')
        setCurrent(0)
        setLoading(false)
        return
      }
      
      // 验证角色数据
      const validRoles = roles.filter(r => r.role && r.role.trim())
      if (validRoles.length === 0) {
        message.error('请至少添加一个有效角色')
        setCurrent(0)
        setLoading(false)
        return
      }
      
      // 获取销售单位（所有角色共用）
      const salesUnit = (allValues.sales_unit || '').trim()
      
      // 准备注册数据（使用第一个角色作为主要角色）
      const firstRole = validRoles[0]
      if (!firstRole || !firstRole.role) {
        console.error('Invalid first role:', firstRole, 'All roles:', roles)
        message.error('角色数据无效，请重新添加角色')
        setCurrent(0)
        setLoading(false)
        return
      }
      
      const registerData: any = {
        username: (allValues.username || '').trim(),
        real_name: (allValues.real_name || '').trim(),
        password: allValues.password || '',
        role: firstRole.role.trim(), // 确保role不为空
        sales_unit: salesUnit,
      }
      
      // 调试日志
      console.log('Register data prepared:', {
        roles,
        validRoles,
        firstRole,
        registerData
      })
      
      // 处理必填字段
      registerData.email = (allValues.email || '').trim()
      registerData.phone = (allValues.phone || '').trim()
      
      // 调试：打印准备发送的数据
      console.log('Register data to send:', registerData)
      
      // 最终验证：确保必填字段不为空
      // 如果字段为空，说明 preserve 没有生效或字段值丢失
      if (!registerData.username) {
        console.error('Username is empty!', { 
          allValues, 
          registerData,
          usernameValue: allValues.username,
          formFields: form.getFieldsValue()
        })
        setCurrent(0)
        form.setFields([{ name: 'username', errors: ['请输入用户名'] }])
        form.scrollToField('username')
        setLoading(false)
        return
      }
      if (!registerData.real_name) {
        console.error('Real name is empty!', { 
          allValues, 
          registerData,
          realNameValue: allValues.real_name
        })
        setCurrent(0)
        form.setFields([{ name: 'real_name', errors: ['请输入真实姓名'] }])
        form.scrollToField('real_name')
        setLoading(false)
        return
      }
      if (!registerData.password) {
        console.error('Password is empty!', { 
          allValues, 
          registerData,
          passwordValue: allValues.password
        })
        form.setFields([{ name: 'password', errors: ['请输入密码'] }])
        form.scrollToField('password')
        setLoading(false)
        return
      }
      
      // 先注册第一个角色
      await registerService.register(registerData)
      
      // 如果有多个角色，继续注册其他角色（使用相同的销售单位）
      if (validRoles.length > 1) {
        for (let i = 1; i < validRoles.length; i++) {
          if (!validRoles[i].role || !validRoles[i].role.trim()) {
            console.warn(`跳过无效角色: ${validRoles[i]}`)
            continue
          }
          const roleData = {
            username: registerData.username,
            email: registerData.email,
            role: validRoles[i].role.trim(),
            sales_unit: salesUnit, // 所有角色使用相同的销售单位
            real_name: registerData.real_name,
            phone: registerData.phone,
            password: registerData.password,
          }
            try {
            await registerService.register(roleData)
          } catch (error: any) {
            // 如果某个角色注册失败，记录错误但继续
            const { logError, extractErrorMessage } = require('../utils/errorHandler')
            logError(`注册角色 ${validRoles[i].role} 失败`, error)
            const errorMsg = extractErrorMessage(error, `注册角色失败`)
            // 如果是因为角色已存在，这是正常的（用户可能已经注册过该角色）
            if (!errorMsg.includes('已经注册过')) {
              message.warning(`角色 ${validRoles[i].role} 注册失败: ${errorMsg}`)
            }
          }
        }
      }
      
      // 注册成功，清除所有错误状态
      setError(null)
      form.setFields([
        { name: 'username', errors: [] },
        { name: 'real_name', errors: [] },
        { name: 'password', errors: [] },
        { name: 'confirm_password', errors: [] },
      ])
      
      const roleCount = validRoles.length
      message.success({
        content: `注册成功！您已注册${roleCount}个角色，账号正在审核中，审核通过后即可登录。`,
        duration: 5,
      })
      
      // 延迟跳转到登录页
      setTimeout(() => {
        navigate('/login')
      }, 2000)
    } catch (error: any) {
      // 如果是表单验证错误，跳转到包含错误字段的步骤
      if (error?.errorFields) {
        const firstErrorField = error.errorFields[0]
        if (firstErrorField?.name) {
          const fieldName = firstErrorField.name[0]
          form.scrollToField(fieldName)
          
          // 根据字段名跳转到相应步骤
          if (fieldName === 'username' || fieldName === 'real_name' || fieldName === 'role') {
            setCurrent(0) // 跳转到第一步
          } else if (fieldName === 'email' || fieldName === 'phone' || fieldName === 'sales_unit' || fieldName === 'department' || fieldName === 'sub_department') {
            setCurrent(1) // 跳转到第二步
          } else if (fieldName === 'password' || fieldName === 'confirm_password') {
            setCurrent(2) // 保持在第三步
          }
        }
        setLoading(false)
        return
      }
      
      // 使用统一的错误处理和日志记录
      logError('注册失败', error)
      
      const errorMsg = extractErrorMsg(error, '注册失败，请稍后重试')
      setError(errorMsg)
      message.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  // 检查用户名格式（不检查是否存在，防止枚举攻击）
  const checkUsername = async (username: string) => {
    if (!username || username.length < 3) {
      setUsernameStatus(null)
      setUsernameMessage('')
      return
    }

    // 前端格式验证
    const usernameRegex = /^[a-zA-Z0-9_]+$/
    if (!usernameRegex.test(username)) {
      setUsernameStatus('unavailable')
      setUsernameMessage('用户名只能包含字母、数字和下划线')
      form.setFields([{ 
        name: 'username', 
        errors: ['用户名只能包含字母、数字和下划线'],
        value: username
      }])
      return
    }

    setUsernameChecking(true)
    setUsernameStatus('checking')
    
    try {
      const result = await registerService.checkUsername(username)
      if (result.available) {
        setUsernameStatus('available')
        setUsernameMessage('用户名格式正确')
        // 清除表单字段错误
        form.setFields([{ name: 'username', errors: [] }])
      } else {
        setUsernameStatus('unavailable')
        setUsernameMessage(result.message || '用户名格式不正确')
        // 设置表单字段错误
        form.setFields([{ 
          name: 'username', 
          errors: [result.message || '用户名格式不正确'],
          value: username
        }])
      }
    } catch (error: any) {
      // 如果是速率限制错误，提示用户
      if (error?.response?.status === 429) {
        setUsernameStatus('unavailable')
        setUsernameMessage('请求过于频繁，请稍后再试')
        form.setFields([{ 
          name: 'username', 
          errors: ['请求过于频繁，请稍后再试'],
          value: username
        }])
      } else {
        setUsernameStatus(null)
        setUsernameMessage('')
      }
    } finally {
      setUsernameChecking(false)
    }
  }

  // 处理用户名输入变化（防抖）
  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const username = e.target.value
    // 清除之前的定时器
    if (checkTimeoutRef.current) {
      clearTimeout(checkTimeoutRef.current)
    }
    
    // 重置状态
    setUsernameStatus(null)
    setUsernameMessage('')
    
    // 如果用户名长度足够，延迟检查
    if (username && username.length >= 3) {
      checkTimeoutRef.current = setTimeout(() => {
        checkUsername(username)
      }, 500) // 500ms 防抖
    }
  }

  // 处理用户名失焦
  const handleUsernameBlur = () => {
    const username = form.getFieldValue('username')
    if (username && username.length >= 3) {
      // 如果还没有检查过，立即检查
      if (usernameStatus === null) {
        checkUsername(username)
      }
    }
  }

  // 组件卸载时清除定时器
  useEffect(() => {
    return () => {
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current)
      }
    }
  }, [])

  // 当切换到第二步时，恢复部门选择状态
  useEffect(() => {
    if (current === 1) {
      const department = formData.department || form.getFieldValue('department')
      const subDepartment = formData.sub_department || form.getFieldValue('sub_department')
      const salesUnit = formData.sales_unit || form.getFieldValue('sales_unit')
      
      if (department) {
        setSelectedDepartment(department)
        if (subDepartment) {
          setSelectedSubDepartment(subDepartment)
        }
        // 恢复表单值
        form.setFieldsValue({
          department,
          sub_department: subDepartment,
          sales_unit: salesUnit
        })
      }
    }
  }, [current])

  const next = async () => {
    try {
      // 验证当前步骤的字段
      if (current === 0) {
        // 如果用户名格式不正确，阻止进入下一步
        if (usernameStatus === 'unavailable') {
          message.error('请先修正用户名格式')
          return
        }
        // 检查是否至少添加了一个角色
        if (roles.length === 0) {
          message.error('请至少添加一个角色')
          return
        }
        await form.validateFields(['username', 'real_name'])
        // 保存当前步骤的数据
        const stepValues = form.getFieldsValue(['username', 'real_name'])
        setFormData(prev => ({ ...prev, ...stepValues }))
      } else if (current === 1) {
        const fieldsToValidate = ['email', 'phone', 'department']
        // 如果选择了一级部门且有二级部门，也需要验证二级部门
        if (selectedDepartment && departments[selectedDepartment as keyof typeof departments]) {
          fieldsToValidate.push('sub_department')
        }
        await form.validateFields(fieldsToValidate)
        // 保存当前步骤的数据
        const stepValues = form.getFieldsValue(['email', 'phone', 'department', 'sub_department', 'sales_unit'])
        setFormData(prev => ({ ...prev, ...stepValues }))
      }
      setCurrent(current + 1)
      setError(null)
    } catch (error: any) {
      const errorFields = error?.errorFields
      if (Array.isArray(errorFields) && errorFields.length > 0) {
        const first = errorFields[0]
        const msg = first.errors?.[0] || '请检查当前步骤的必填项与格式'
        message.error(msg)
        const name = first.name
        if (name) {
          form.scrollToField(name)
        }
      }
    }
  }

  const prev = () => {
    setCurrent(current - 1)
    setError(null)
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

      {/* 右侧注册表单区域 */}
      <div
        style={{
          flex: '0 0 40%',
          background: '#f5f7fa',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '30px 40px',
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
            marginTop: '0',
            marginBottom: '0',
          }}
          styles={{ body: { padding: '24px 32px' } }}
        >
          <div style={{ marginBottom: '20px' }}>
            <Title
              level={3}
              style={{
                margin: 0,
                fontWeight: 600,
                color: '#1a1a1a',
                fontSize: '22px',
                marginBottom: '4px',
              }}
            >
              用户注册
            </Title>
            <Text type="secondary" style={{ fontSize: '13px', color: '#8c8c8c' }}>
              注册后需要管理员审核，审核通过后即可登录
            </Text>
          </div>

          {/* 步骤条 */}
          <Steps
            current={current}
            items={steps}
            style={{ marginBottom: '20px' }}
            size="small"
          />

          {error && (
            <Alert
              message={error}
              type="error"
              showIcon
              closable
              onClose={() => setError(null)}
              style={{ marginBottom: '16px', borderRadius: '10px' }}
            />
          )}

          <Form
            form={form}
            name="register"
            onFinish={onFinish}
            autoComplete="off"
            size="large"
            layout="vertical"
            preserve={true}  // 保留所有字段值，即使字段未渲染
          >
            {/* 步骤1: 基本信息 */}
            {current === 0 && (
              <>
                <Form.Item
                  name="username"
                  label="用户名"
                  rules={[
                    { required: true, message: '请输入用户名' },
                    { min: 3, message: '用户名至少3个字符' },
                    { max: 50, message: '用户名最多50个字符' },
                  ]}
                  style={{ marginBottom: '12px' }}
                  validateStatus={usernameStatus === 'unavailable' ? 'error' : usernameStatus === 'available' ? 'success' : ''}
                  help={
                    usernameStatus === 'checking'
                      ? '正在验证用户名格式...'
                      : usernameStatus === 'available'
                        ? (
                            <span style={{ color: '#52c41a' }}>
                              <CheckCircleOutlined /> 用户名格式正确
                            </span>
                          )
                        : usernameStatus === 'unavailable'
                          ? (
                              <span style={{ color: '#ff4d4f' }}>
                                <CloseCircleOutlined /> {usernameMessage || '用户名格式不正确'}
                              </span>
                            )
                          : undefined
                  }
                >
                  <Input
                    prefix={<UserOutlined style={{ color: '#8c8c8c' }} />}
                    placeholder="请输入用户名"
                    style={{ height: '40px', borderRadius: '8px' }}
                    onChange={(e) => {
                      handleUsernameChange(e)
                      // 实时保存用户名
                      setFormData(prev => ({ ...prev, username: e.target.value }))
                    }}
                    onBlur={handleUsernameBlur}
                    disabled={usernameChecking}
                  />
                </Form.Item>

                <Form.Item
                  name="real_name"
                  label="真实姓名"
                  rules={[
                    { required: true, message: '请输入真实姓名' },
                    { max: 50, message: '真实姓名最多50个字符' },
                  ]}
                  style={{ marginBottom: '12px' }}
                >
                  <Input
                    placeholder="请输入真实姓名"
                    style={{ height: '40px', borderRadius: '8px' }}
                    onChange={(e) => {
                      // 实时保存真实姓名
                      setFormData(prev => ({ ...prev, real_name: e.target.value }))
                    }}
                  />
                </Form.Item>

                <Form.Item
                  label="角色"
                  style={{ marginBottom: '12px' }}
                  required
                >
                  <div>
                    {/* 已添加的角色列表 */}
                    {roles.length > 0 && (
                      <div style={{ marginBottom: '12px' }}>
                        {roles.map((r, index) => (
                          <Tag
                            key={index}
                            closable
                            onClose={() => {
                              const newRoles = roles.filter((_, i) => i !== index)
                              setRoles(newRoles)
                            }}
                            style={{ marginBottom: '8px', padding: '4px 12px', fontSize: '13px' }}
                          >
                            {r.role === 'member' ? '成员' : 
                             r.role === 'team_leader' ? '组长' :
                             r.role === 'task_initiator' ? '专项任务发起人' :
                             r.role === 'sales_contact' ? '销售单位接口人' : r.role}
                          </Tag>
                        ))}
                      </div>
                    )}
                    
                    {/* 添加角色表单 */}
                    <Space.Compact style={{ width: '100%', marginBottom: '8px' }}>
                      <Select
                        placeholder="选择角色"
                        style={{ flex: 1, height: '40px' }}
                        value={currentRoleForm.role}
                        onChange={(value) => {
                          setCurrentRoleForm(prev => ({ ...prev, role: value }))
                        }}
                      >
                        <Select.Option value="member">成员</Select.Option>
                        <Select.Option value="team_leader">组长</Select.Option>
                        <Select.Option value="task_initiator">专项任务发起人</Select.Option>
                        <Select.Option value="sales_contact">销售单位接口人</Select.Option>
                      </Select>
                      <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => {
                          if (!currentRoleForm.role) {
                            message.warning('请先选择角色')
                            return
                          }
                          // 检查是否已存在相同角色
                          const exists = roles.some(r => r.role === currentRoleForm.role)
                          if (exists) {
                            message.warning('该角色已添加，请勿重复添加')
                            return
                          }
                          setRoles(prev => [...prev, { role: currentRoleForm.role }])
                          setCurrentRoleForm({ role: '' })
                        }}
                        style={{ height: '40px' }}
                      >
                        添加
                      </Button>
                    </Space.Compact>
                    
                    <Text type="secondary" style={{ fontSize: '12px', display: 'block', marginTop: '4px' }}>
                      提示：部门将在下一步设置，所有角色将使用相同的部门
                    </Text>
                    
                    {roles.length === 0 && (
                      <div style={{ color: '#ff4d4f', fontSize: '12px', marginTop: '4px' }}>
                        请至少添加一个角色
                      </div>
                    )}
                  </div>
                </Form.Item>
              </>
            )}

            {/* 步骤2: 联系信息 */}
            {current === 1 && (
              <>
                <Form.Item
                  name="email"
                  label="邮箱"
                  normalize={trimFormString}
                  rules={[
                    { required: true, message: '请输入邮箱' },
                    { type: 'email', message: '请输入有效的邮箱地址' },
                  ]}
                  style={{ marginBottom: '12px' }}
                >
                  <Input
                    prefix={<MailOutlined style={{ color: '#8c8c8c' }} />}
                    placeholder="请输入邮箱"
                    style={{ height: '40px', borderRadius: '8px' }}
                    onChange={(e) => {
                      // 与 Form normalize 一致，避免 formData 与表单值不一致
                      setFormData((prev) => ({ ...prev, email: (e.target.value || '').trim() }))
                    }}
                  />
                </Form.Item>

                <Form.Item
                  name="phone"
                  label="手机号"
                  normalize={trimFormString}
                  rules={[
                    { required: true, message: '请输入手机号' },
                    { pattern: /^1[3-9]\d{9}$/, message: '请输入有效的手机号' },
                  ]}
                  style={{ marginBottom: '12px' }}
                >
                  <Input
                    prefix={<PhoneOutlined style={{ color: '#8c8c8c' }} />}
                    placeholder="请输入手机号"
                    style={{ height: '40px', borderRadius: '8px' }}
                    onChange={(e) => {
                      setFormData((prev) => ({ ...prev, phone: (e.target.value || '').trim() }))
                    }}
                  />
                </Form.Item>

                <Form.Item
                  name="department"
                  label="一级部门"
                  rules={[
                    { required: true, message: '请选择一级部门' },
                  ]}
                  style={{ marginBottom: '12px' }}
                >
                  <Select
                    placeholder="请选择一级部门"
                    style={{ height: '40px', borderRadius: '8px' }}
                    allowClear
                    onChange={(value) => {
                      if (!value) {
                        // 清空选择
                        setSelectedDepartment(null)
                        setSelectedSubDepartment(null)
                        form.setFieldsValue({ sales_unit: undefined, sub_department: undefined, department: undefined })
                        setFormData(prev => ({ ...prev, department: undefined, sub_department: undefined, sales_unit: undefined }))
                        return
                      }
                      setSelectedDepartment(value)
                      setSelectedSubDepartment(null)
                      // 如果选择的是没有二级部门的，直接保存一级部门
                      if (departments[value as keyof typeof departments] === null) {
                        const salesUnit = value
                        form.setFieldsValue({ sales_unit: salesUnit, sub_department: undefined })
                        setFormData(prev => ({ ...prev, sales_unit: salesUnit, department: value }))
                      } else {
                        // 如果有二级部门，先清空sales_unit，等待选择二级部门
                        form.setFieldsValue({ sales_unit: undefined, sub_department: undefined })
                        setFormData(prev => ({ ...prev, department: value, sub_department: undefined, sales_unit: undefined }))
                      }
                    }}
                  >
                    {Object.keys(departments).map((dept) => (
                      <Select.Option key={dept} value={dept}>
                        {dept}
                      </Select.Option>
                    ))}
                  </Select>
                </Form.Item>

                {selectedDepartment && departments[selectedDepartment as keyof typeof departments] && (
                  <Form.Item
                    name="sub_department"
                    label="二级部门"
                    rules={[
                      { required: true, message: '请选择二级部门' },
                    ]}
                    style={{ marginBottom: '12px' }}
                  >
                    <Select
                      placeholder="请选择二级部门"
                      style={{ height: '40px', borderRadius: '8px' }}
                      allowClear
                      onChange={(value) => {
                        if (!value) {
                          // 清空二级部门选择
                          setSelectedSubDepartment(null)
                          form.setFieldsValue({ sales_unit: undefined, sub_department: undefined })
                          setFormData(prev => ({ ...prev, sub_department: undefined, sales_unit: undefined }))
                          return
                        }
                        setSelectedSubDepartment(value)
                        // 组合一级和二级部门
                        const salesUnit = `${selectedDepartment} - ${value}`
                        form.setFieldsValue({ sales_unit: salesUnit })
                        setFormData(prev => ({ ...prev, sales_unit: salesUnit, sub_department: value }))
                      }}
                    >
                      {departments[selectedDepartment as keyof typeof departments]?.map((subDept) => (
                        <Select.Option key={subDept} value={subDept}>
                          {subDept}
                        </Select.Option>
                      ))}
                    </Select>
                  </Form.Item>
                )}

                {/* 隐藏字段，用于提交时保存完整的部门信息 */}
                <Form.Item name="sales_unit" hidden>
                  <Input />
                </Form.Item>
              </>
            )}

            {/* 步骤3: 密码设置 */}
            {current === 2 && (
              <>
                <Form.Item
                  name="password"
                  label="密码"
                  rules={[
                    { required: true, message: '请输入密码' },
                    { min: 8, message: '密码至少8个字符' },
                  ]}
                  style={{ marginBottom: '12px' }}
                >
                  <Input.Password
                    prefix={<LockOutlined style={{ color: '#8c8c8c' }} />}
                    placeholder="请输入密码"
                    style={{ height: '40px', borderRadius: '8px' }}
                    onChange={(e) => {
                      // 实时保存密码字段
                      setFormData(prev => ({ ...prev, password: e.target.value }))
                    }}
                  />
                </Form.Item>

                <Form.Item
                  name="confirm_password"
                  label="确认密码"
                  dependencies={['password']}
                  rules={[
                    { required: true, message: '请确认密码' },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        if (!value || getFieldValue('password') === value) {
                          return Promise.resolve()
                        }
                        return Promise.reject(new Error('两次输入的密码不一致'))
                      },
                    }),
                  ]}
                  style={{ marginBottom: '12px' }}
                >
                  <Input.Password
                    prefix={<LockOutlined style={{ color: '#8c8c8c' }} />}
                    placeholder="请再次输入密码"
                    style={{ height: '40px', borderRadius: '8px' }}
                  />
                </Form.Item>
              </>
            )}

            {/* 按钮区域 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px' }}>
              {current > 0 && (
                <Button
                  onClick={prev}
                  style={{
                    height: '40px',
                    borderRadius: '8px',
                    fontSize: '14px',
                    padding: '0 20px',
                  }}
                >
                  上一步
                </Button>
              )}
              {current < steps.length - 1 && (
                <Button
                  type="primary"
                  onClick={next}
                  style={{
                    height: '40px',
                    borderRadius: '8px',
                    fontSize: '14px',
                    padding: '0 20px',
                    marginLeft: current === 0 ? 'auto' : '8px',
                    background: 'linear-gradient(135deg, #1890ff 0%, #36cfc9 100%)',
                    border: 'none',
                    boxShadow: '0 4px 12px rgba(24, 144, 255, 0.3)',
                  }}
                >
                  下一步
                </Button>
              )}
              {current === steps.length - 1 && (
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={loading}
                  style={{
                    height: '40px',
                    borderRadius: '8px',
                    fontSize: '15px',
                    fontWeight: 500,
                    background: 'linear-gradient(135deg, #1890ff 0%, #36cfc9 100%)',
                    border: 'none',
                    boxShadow: '0 4px 12px rgba(24, 144, 255, 0.3)',
                    marginLeft: current === 0 ? 0 : 'auto',
                    width: 'auto',
                    padding: '0 24px',
                  }}
                  onClick={async () => {
                    try {
                      // 获取当前部门选择情况
                      const currentValues = form.getFieldsValue()
                      const department = currentValues.department || formData.department
                      
                      // 构建验证字段列表
                      const fieldsToValidate: string[] = [
                        'username',
                        'real_name',
                        'email',
                        'phone',
                        'department',
                        'password',
                        'confirm_password'
                      ]
                      
                      // 如果选择了一级部门且有二级部门，也需要验证二级部门
                      if (department && departments[department as keyof typeof departments]) {
                        fieldsToValidate.push('sub_department')
                      }
                      
                      // 先验证所有字段（明确指定字段列表）
                      await form.validateFields(fieldsToValidate)
                      // 验证通过后，触发表单提交
                      form.submit()
                    } catch (error) {
                      // 验证失败，滚动到第一个错误字段
                      const errorFields = (error as any)?.errorFields
                      if (errorFields && errorFields.length > 0) {
                        const fieldName = errorFields[0].name[0]
                        form.scrollToField(fieldName)
                        // 根据字段名跳转到相应步骤
                        if (fieldName === 'username' || fieldName === 'real_name') {
                          setCurrent(0)
                        } else if (fieldName === 'email' || fieldName === 'phone' || fieldName === 'department' || fieldName === 'sub_department') {
                          setCurrent(1)
                        } else if (fieldName === 'password' || fieldName === 'confirm_password') {
                          setCurrent(2)
                        }
                      }
                    }
                  }}
                >
                  {loading ? '注册中...' : '注册'}
                </Button>
              )}
            </div>

            <div style={{ textAlign: 'center', marginTop: '12px' }}>
              <Text type="secondary" style={{ fontSize: '13px' }}>
                已有账号？{' '}
                <Link to="/login" style={{ color: '#1890ff' }}>
                  立即登录
                </Link>
              </Text>
            </div>
          </Form>

          <div style={{ marginTop: '12px', textAlign: 'center' }}>
            <Space size="small" style={{ color: '#8c8c8c' }}>
              <SafetyOutlined style={{ color: '#52c41a', fontSize: '12px' }} />
              <Text type="secondary" style={{ fontSize: '12px' }}>
                安全注册，保护您的账户安全
              </Text>
            </Space>
          </div>
        </Card>
      </div>
    </div>
  )
}

export default Register
