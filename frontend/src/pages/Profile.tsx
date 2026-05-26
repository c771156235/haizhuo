/**
 * 个人中心页面
 */
import { useState, useEffect } from 'react'
import type { UploadProps } from 'antd'
import { Card, Descriptions, Button, Form, Input, message, Space, Avatar, Tag, Typography, Modal, Select, Upload } from 'antd'
import { UserOutlined, EditOutlined, SaveOutlined, MailOutlined, PhoneOutlined, CameraOutlined, LockOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { userService, UserUpdate } from '../services/user'
import { uploadService } from '../services/upload'
import { useAuth } from '../contexts/AuthContext'
import { authService } from '../services/auth'
import { UserRoleLabels } from '../types/user'
import Loading from '../components/Loading'
import ErrorBoundary from '../components/ErrorBoundary'
import dayjs from 'dayjs'
import { extractErrorMessage } from '../utils/errorHandler'
import { trimFormString } from '../utils/formNormalize'

const { Title, Text } = Typography
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

// 解析销售单位，返回一级部门和二级部门
const parseSalesUnit = (salesUnit: string | undefined): { department: string | null; subDepartment: string | null } => {
  if (!salesUnit) {
    return { department: null, subDepartment: null }
  }
  
  // 检查是否包含 " - " 分隔符（二级部门格式）
  if (salesUnit.includes(' - ')) {
    const parts = salesUnit.split(' - ')
    if (parts.length === 2) {
      return { department: parts[0], subDepartment: parts[1] }
    }
  }
  
  // 如果没有分隔符，说明只有一级部门
  // 检查是否是一级部门列表中的某个值
  if (Object.keys(departments).includes(salesUnit)) {
    return { department: salesUnit, subDepartment: null }
  }
  
  return { department: null, subDepartment: null }
}

const Profile = () => {
  const { user: currentUser, refreshUser, getCurrentRole } = useAuth()
  const currentRole = getCurrentRole()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [passwordModalVisible, setPasswordModalVisible] = useState(false)
  const [form] = Form.useForm()
  const [passwordForm] = Form.useForm()
  
  // 部门选择相关状态
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null)
  const [_selectedSubDepartment, setSelectedSubDepartment] = useState<string | null>(null)

  const { data: user, isLoading, error, refetch } = useQuery(
    ['user', currentUser?.id],
    () => userService.getUser(currentUser?.id!),
    {
      enabled: !!currentUser?.id,
    }
  )

  // 当用户数据加载完成且进入编辑模式时，设置表单值
  useEffect(() => {
    if (user && editing) {
      // 解析销售单位
      const { department, subDepartment } = parseSalesUnit(user.sales_unit)
      setSelectedDepartment(department)
      setSelectedSubDepartment(subDepartment)
      
      form.setFieldsValue({
        real_name: user.real_name,
        email: user.email,
        phone: user.phone,
        department: department,
        sub_department: subDepartment,
        sales_unit: user.sales_unit,
      })
    }
  }, [user, editing, form])

  const updateMutation = useMutation(
    (data: UserUpdate) => userService.updateUser(currentUser?.id!, data),
    {
      onSuccess: async () => {
        message.success('个人信息更新成功')
        setEditing(false)
        queryClient.invalidateQueries(['user', currentUser?.id])
        queryClient.invalidateQueries('users')
        // 刷新用户信息
        await refetch()
        // 更新AuthContext中的用户信息
        await refreshUser()
      },
      onError: (error: any) => {
        message.error(extractErrorMessage(error, '更新失败'))
      },
    }
  )

  const uploadAvatarMutation = useMutation(
    (file: File) => uploadService.uploadAvatar(file),
    {
      onSuccess: async () => {
        message.success('头像上传成功')
        queryClient.invalidateQueries(['user', currentUser?.id])
        queryClient.invalidateQueries('users')
        // 刷新用户信息
        await refetch()
        // 更新AuthContext中的用户信息
        await refreshUser()
      },
      onError: (error: any) => {
        message.error(extractErrorMessage(error, '头像上传失败'))
      },
    }
  )

  const beforeAvatarUpload: UploadProps['beforeUpload'] = async (file) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      message.error('仅支持 JPG、PNG、GIF、WEBP 格式的图片')
      return Upload.LIST_IGNORE
    }
    const maxSize = 5 * 1024 * 1024
    if (file.size > maxSize) {
      message.error('图片大小不能超过 5MB')
      return Upload.LIST_IGNORE
    }
    try {
      await uploadAvatarMutation.mutateAsync(file as File)
    } catch {
      // 错误已在 mutation 中处理
    }
    return false
  }

  const handleSubmit = (values: any) => {
    // 处理销售单位：如果有一级和二级部门，组合成 "一级部门 - 二级部门" 格式
    let salesUnit = ''
    if (values.department) {
      if (values.sub_department) {
        salesUnit = `${values.department} - ${values.sub_department}`
      } else {
        salesUnit = values.department
      }
    }
    
    const updateData = {
      real_name: values.real_name,
      email: values.email,
      phone: values.phone,
      sales_unit: salesUnit || undefined,
    }
    
    updateMutation.mutate(updateData)
  }

  const handleCancel = () => {
    setEditing(false)
    form.resetFields()
    if (user) {
      // 解析销售单位
      const { department, subDepartment } = parseSalesUnit(user.sales_unit)
      setSelectedDepartment(department)
      setSelectedSubDepartment(subDepartment)
      
      form.setFieldsValue({
        real_name: user.real_name,
        email: user.email,
        phone: user.phone,
        department: department,
        sub_department: subDepartment,
        sales_unit: user.sales_unit,
      })
    }
  }

  const changePasswordMutation = useMutation(
    (data: { old_password: string; new_password: string }) => authService.changePassword(data),
    {
      onSuccess: () => {
        message.success('密码修改成功，请重新登录')
        setPasswordModalVisible(false)
        passwordForm.resetFields()
        // 延迟退出登录，让用户看到成功提示
        setTimeout(() => {
          // 这里可以选择是否自动退出登录，或者只是关闭弹窗
          // 如果需要强制退出，可以调用 logout()
        }, 1500)
      },
      onError: (error: any) => {
        message.error(extractErrorMessage(error, '密码修改失败'))
      },
    }
  )

  const handlePasswordSubmit = (values: any) => {
    changePasswordMutation.mutate({
      old_password: values.old_password,
      new_password: values.new_password,
    })
  }

  const handlePasswordCancel = () => {
    setPasswordModalVisible(false)
    passwordForm.resetFields()
  }

  if (isLoading) {
    return <Loading tip="加载个人信息..." />
  }

  if (error) {
    return <ErrorBoundary error={error as Error} onRetry={() => refetch()} title="加载个人信息失败" />
  }

  if (!user) {
    return null
  }

  return (
    <div>
      <div style={{ marginBottom: '24px' }}>
        <Title level={2} style={{ margin: 0, fontSize: '24px', fontWeight: 600 }}>
          个人中心
        </Title>
        <Text type="secondary" style={{ fontSize: '14px' }}>
          查看和管理您的个人信息
        </Text>
      </div>

      <Card
        styles={{
          body: {
            padding: '24px',
          },
        }}
        style={{
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
        }}
      >
        {/* 用户头像和信息头部 */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '32px', paddingBottom: '24px', borderBottom: '1px solid #f0f0f0' }}>
          <Upload
            accept="image/jpeg,image/png,image/gif,image/webp"
            showUploadList={false}
            disabled={uploadAvatarMutation.isLoading}
            beforeUpload={beforeAvatarUpload}
          >
            <div style={{ position: 'relative', cursor: 'pointer' }}>
              <Avatar
                size={80}
                src={user.avatar ? uploadService.getAvatarUrl(user.avatar) : undefined}
                style={{
                  background: user.avatar ? 'transparent' : 'linear-gradient(135deg, #1890ff 0%, #36cfc9 100%)',
                  border: '3px solid #fff',
                  boxShadow: '0 4px 12px rgba(24, 144, 255, 0.3)',
                }}
                icon={!user.avatar ? <UserOutlined /> : undefined}
                onError={() => false}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  right: 0,
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #1890ff 0%, #36cfc9 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  border: '2px solid #fff',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                  pointerEvents: 'none',
                  transition: 'all 0.3s',
                }}
              >
                <CameraOutlined style={{ color: '#fff', fontSize: '14px' }} />
              </div>
            </div>
          </Upload>
          <div style={{ marginLeft: '24px', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <Title level={3} style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>
                {user.real_name}
              </Title>
              <Tag
                color="blue"
                style={{
                  fontSize: '13px',
                  padding: '2px 12px',
                  borderRadius: '12px',
                  fontWeight: 500,
                }}
              >
                {UserRoleLabels[currentRole?.role as keyof typeof UserRoleLabels] || currentRole?.role || user?.role}
              </Tag>
            </div>
            <Text type="secondary" style={{ fontSize: '14px' }}>
              {user.username}
            </Text>
          </div>
          {!editing && (
            <Space>
              <Button
                icon={<LockOutlined />}
                onClick={() => setPasswordModalVisible(true)}
              >
                修改密码
              </Button>
              <Button
                type="primary"
                icon={<EditOutlined />}
                onClick={() => setEditing(true)}
              >
                编辑信息
              </Button>
            </Space>
          )}
        </div>

        {!editing ? (
          <Descriptions column={2} bordered>
            <Descriptions.Item label="用户名" span={1}>
              {user.username}
            </Descriptions.Item>
            <Descriptions.Item label="角色" span={1}>
              <Tag color="blue">
                {UserRoleLabels[currentRole?.role as keyof typeof UserRoleLabels] || currentRole?.role || user?.role}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="真实姓名" span={1}>
              {user.real_name}
            </Descriptions.Item>
            <Descriptions.Item label="邮箱" span={1}>
              {user.email || <Text type="secondary">未设置</Text>}
            </Descriptions.Item>
            <Descriptions.Item label="手机号" span={1}>
              {user.phone || <Text type="secondary">未设置</Text>}
            </Descriptions.Item>
            <Descriptions.Item label="所属部门" span={1}>
              {user.sales_unit || <Text type="secondary">未设置</Text>}
            </Descriptions.Item>
            {currentUser?.role === 'manager' && (
              <Descriptions.Item label="账户状态" span={1}>
                <Tag color={user.is_active ? 'green' : 'default'}>
                  {user.is_active ? '活跃' : '已禁用'}
                </Tag>
              </Descriptions.Item>
            )}
            <Descriptions.Item label="注册时间" span={1}>
              {dayjs(user.created_at).format('YYYY-MM-DD HH:mm:ss')}
            </Descriptions.Item>
            <Descriptions.Item label="最后更新" span={2}>
              {dayjs(user.updated_at).format('YYYY-MM-DD HH:mm:ss')}
            </Descriptions.Item>
          </Descriptions>
        ) : (
          <Form
            form={form}
            onFinish={handleSubmit}
            layout="vertical"
            style={{ maxWidth: '600px' }}
          >
            <Form.Item label="用户名">
              <Input value={user.username || ''} disabled />
            </Form.Item>

            <Form.Item label="角色">
              <Input
                value={UserRoleLabels[user.role as keyof typeof UserRoleLabels] || user.role || ''}
                disabled
              />
            </Form.Item>

            <Form.Item
              name="real_name"
              label="真实姓名"
              rules={[{ required: true, message: '请输入真实姓名' }]}
            >
              <Input
                prefix={<UserOutlined style={{ color: '#1890ff' }} />}
                placeholder="请输入真实姓名"
              />
            </Form.Item>

            <Form.Item
              name="email"
              label="邮箱"
              normalize={trimFormString}
              rules={[{ type: 'email', message: '请输入有效的邮箱地址' }]}
            >
              <Input
                prefix={<MailOutlined style={{ color: '#1890ff' }} />}
                placeholder="请输入邮箱"
              />
            </Form.Item>

            <Form.Item
              name="phone"
              label="手机号"
              normalize={trimFormString}
              rules={[{ pattern: /^1[3-9]\d{9}$/, message: '请输入有效的手机号' }]}
            >
              <Input
                prefix={<PhoneOutlined style={{ color: '#1890ff' }} />}
                placeholder="请输入手机号"
              />
            </Form.Item>

            <Form.Item
              name="department"
              label="一级部门"
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
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<SaveOutlined />}
                  loading={updateMutation.isLoading}
                >
                  保存
                </Button>
                <Button onClick={handleCancel}>取消</Button>
              </Space>
            </Form.Item>
          </Form>
        )}
      </Card>

      {/* 修改密码弹窗 */}
      <Modal
        title="修改密码"
        open={passwordModalVisible}
        onCancel={handlePasswordCancel}
        footer={null}
        width={500}
      >
        <Form
          form={passwordForm}
          onFinish={handlePasswordSubmit}
          layout="vertical"
          style={{ marginTop: '24px' }}
        >
          <Form.Item
            name="old_password"
            label="旧密码"
            rules={[{ required: true, message: '请输入旧密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#1890ff' }} />}
              placeholder="请输入当前密码"
            />
          </Form.Item>

          <Form.Item
            name="new_password"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 8, message: '密码长度至少8位' },
              {
                pattern: /(?=.*[a-z])/,
                message: '密码必须包含小写字母',
              },
              {
                pattern: /(?=.*[A-Z])/,
                message: '密码必须包含大写字母',
              },
              {
                pattern: /(?=.*\d)/,
                message: '密码必须包含数字',
              },
              {
                pattern: /(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/,
                message: '密码必须包含特殊字符',
              },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#1890ff' }} />}
              placeholder="请输入新密码（至少8位，包含大小写字母、数字和特殊字符）"
            />
          </Form.Item>

          <Form.Item
            name="confirm_password"
            label="确认新密码"
            dependencies={['new_password']}
            rules={[
              { required: true, message: '请确认新密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('new_password') === value) {
                    return Promise.resolve()
                  }
                  return Promise.reject(new Error('两次输入的密码不一致'))
                },
              }),
            ]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#1890ff' }} />}
              placeholder="请再次输入新密码"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, marginTop: '24px' }}>
            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
              <Button onClick={handlePasswordCancel}>取消</Button>
              <Button
                type="primary"
                htmlType="submit"
                loading={changePasswordMutation.isLoading}
              >
                确认修改
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default Profile

