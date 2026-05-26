/**
 * 创建用户页面
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, Form, Input, Button, message, Space, Select, Tag } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import { useMutation, useQueryClient } from 'react-query'
import { userService, UserCreate } from '../services/user'
import { useAuth } from '../contexts/AuthContext'
import { PageBreadcrumb } from '../components/PageBreadcrumb'
import { UserRoleLabels } from '../types/user'
import { extractErrorMessage, logError } from '../utils/errorHandler'
import { trimFormString } from '../utils/formNormalize'

const { Option } = Select

// 部门数据结构（与注册页面保持一致）
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

const UserCreatePage = () => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form] = Form.useForm()
  
  // 多角色相关状态
  const [roles, setRoles] = useState<Array<{ role: string }>>([])
  const [currentRoleForm, setCurrentRoleForm] = useState<{ role: string }>({ role: '' })
  
  // 部门选择相关状态
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null)
  const [_selectedSubDepartment, setSelectedSubDepartment] = useState<string | null>(null)

  const createMutation = useMutation((data: UserCreate) => userService.createUser(data), {
    onSuccess: () => {
      // 成功逻辑在 handleSubmit 中处理
    },
    onError: (error: unknown) => {
      logError('创建用户失败', error)
      // Toast 与表单项错误在 handleSubmit 的 catch 中统一处理，避免重复提示
    },
  })

  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (values: any) => {
    // 检查是否至少添加了一个角色
    if (roles.length === 0) {
      message.error('请至少添加一个角色')
      return
    }
    
    // 验证角色数据
    const validRoles = roles.filter(r => r.role && r.role.trim())
    if (validRoles.length === 0) {
      message.error('请至少添加一个有效角色')
      return
    }
    
    // 获取销售单位
    const salesUnit = (values.sales_unit || '').trim()
    
    // 准备创建数据（使用第一个角色作为主要角色）
    const firstRole = validRoles[0]
    if (!firstRole || !firstRole.role) {
      message.error('角色数据无效，请重新添加角色')
      return
    }
    
    const baseData: UserCreate = {
      username: (values.username || '').trim(),
      real_name: (values.real_name || '').trim(),
      password: values.password || '',
      email: (values.email || '').trim(),
      phone: (values.phone || '').trim(),
      role: firstRole.role.trim(),
      sales_unit: salesUnit || undefined,
    }
    
    setSubmitting(true)
    try {
      await createMutation.mutateAsync(baseData)

      if (validRoles.length > 1) {
        for (let i = 1; i < validRoles.length; i++) {
          if (!validRoles[i].role || !validRoles[i].role.trim()) {
            continue
          }
          const roleData = {
            ...baseData,
            role: validRoles[i].role.trim(),
          }
          try {
            await createMutation.mutateAsync(roleData)
          } catch (err: unknown) {
            logError(`创建角色 ${validRoles[i].role} 失败`, err)
            const errorMsg = extractErrorMessage(err, '创建角色失败')
            message.warning(`角色 ${validRoles[i].role} 创建失败: ${errorMsg}`)
          }
        }
      }

      const roleCount = validRoles.length
      message.success({
        content: `用户创建成功！已创建${roleCount}个角色。`,
        duration: 3,
      })
      queryClient.invalidateQueries('users')
      navigate('/users')
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, '创建失败')
      message.error(msg)
      if (/邮箱|邮件|email/i.test(msg)) {
        form.setFields([{ name: 'email', errors: [msg] }])
      } else if (/用户名|username/i.test(msg)) {
        form.setFields([{ name: 'username', errors: [msg] }])
      } else if (/手机|电话|phone/i.test(msg)) {
        form.setFields([{ name: 'phone', errors: [msg] }])
      }
    } finally {
      setSubmitting(false)
    }
  }

  // 只有总管可以创建用户
  const { getCurrentRole } = useAuth()
  const currentRole = getCurrentRole()
  if (currentRole?.role !== 'manager') {
    return <div>无权访问</div>
  }

  return (
    <div>
      <PageBreadcrumb
        items={[
          { title: '用户管理', to: '/users' },
          { title: '创建用户' },
        ]}
      />

      <Card title="创建用户">
        <Form
          form={form}
          onFinish={handleSubmit}
          layout="vertical"
          initialValues={{
            is_active: true,
          }}
        >
          <Form.Item
            name="username"
            label="用户名"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input placeholder="请输入用户名" />
          </Form.Item>

          <Form.Item
            name="password"
            label="密码"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码长度至少6位' },
            ]}
          >
            <Input.Password placeholder="请输入密码（至少6位）" />
          </Form.Item>

          <Form.Item
            name="real_name"
            label="真实姓名"
            rules={[{ required: true, message: '请输入真实姓名' }]}
          >
            <Input placeholder="请输入真实姓名" />
          </Form.Item>

          <Form.Item
            name="email"
            label="邮箱"
            normalize={trimFormString}
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '请输入有效的邮箱地址' },
            ]}
          >
            <Input placeholder="请输入邮箱" />
          </Form.Item>

          <Form.Item
            name="phone"
            label="手机号"
            normalize={trimFormString}
            rules={[
              { required: true, message: '请输入手机号' },
              { pattern: /^1[3-9]\d{9}$/, message: '请输入有效的手机号' },
            ]}
          >
            <Input placeholder="请输入手机号" />
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
                       r.role === 'sales_contact' ? '销售单位接口人' : 
                       r.role === 'manager' ? '总管' : r.role}
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
                  {Object.entries(UserRoleLabels).map(([value, label]) => (
                    <Option key={value} value={value}>
                      {label}
                    </Option>
                  ))}
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
              
              {roles.length === 0 && (
                <div style={{ color: '#ff4d4f', fontSize: '12px', marginTop: '4px' }}>
                  请至少添加一个角色
                </div>
              )}
            </div>
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
                  return
                }
                setSelectedDepartment(value)
                setSelectedSubDepartment(null)
                // 如果选择的是没有二级部门的，直接保存一级部门
                if (departments[value as keyof typeof departments] === null) {
                  const salesUnit = value
                  form.setFieldsValue({ sales_unit: salesUnit, sub_department: undefined })
                } else {
                  // 如果有二级部门，先清空sales_unit，等待选择二级部门
                  form.setFieldsValue({ sales_unit: undefined, sub_department: undefined })
                }
              }}
            >
              {Object.keys(departments).map((dept) => (
                <Option key={dept} value={dept}>
                  {dept}
                </Option>
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
                    return
                  }
                  setSelectedSubDepartment(value)
                  // 组合一级和二级部门
                  const salesUnit = `${selectedDepartment} - ${value}`
                  form.setFieldsValue({ sales_unit: salesUnit })
                }}
              >
                {departments[selectedDepartment as keyof typeof departments]?.map((subDept) => (
                  <Option key={subDept} value={subDept}>
                    {subDept}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          )}

          {/* 隐藏字段，用于提交时保存完整的部门信息 */}
          <Form.Item name="sales_unit" hidden>
            <Input />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={submitting}>
                提交
              </Button>
              <Button onClick={() => navigate('/users')}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}

export default UserCreatePage

