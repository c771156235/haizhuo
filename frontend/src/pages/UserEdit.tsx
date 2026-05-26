/**
 * 编辑用户页面
 */
import { useState } from 'react'
import type { UploadProps } from 'antd'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Card, Form, Input, Button, message, Space, Switch, Result, Select, Avatar, Tag, Popconfirm, Upload } from 'antd'
import { UserOutlined, CameraOutlined, PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { userService, UserUpdate } from '../services/user'
import { uploadService } from '../services/upload'
import { useAuth } from '../contexts/AuthContext'
import Loading from '../components/Loading'
import { PageBreadcrumb } from '../components/PageBreadcrumb'
import { UserRoleLabels } from '../types/user'
import { extractErrorMessage } from '../utils/errorHandler'
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

const UserEditPage = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const [form] = Form.useForm()
  const [selectedRole, setSelectedRole] = useState<string>('')
  
  // 从 URL 参数读取分页信息，用于返回列表时恢复分页状态
  const page = searchParams.get('page') || '1'
  const pageSize = searchParams.get('page_size') || '10'
  const search = searchParams.get('search') || ''
  const role = searchParams.get('role') || ''
  const approvalStatus = searchParams.get('approval_status') || ''
  
  // 构建返回列表的 URL，包含所有查询参数
  const getBackUrl = () => {
    const params = new URLSearchParams()
    if (page) params.set('page', page)
    if (pageSize) params.set('page_size', pageSize)
    if (search) params.set('search', search)
    if (role) params.set('role', role)
    if (approvalStatus) params.set('approval_status', approvalStatus)
    const queryString = params.toString()
    return `/users${queryString ? `?${queryString}` : ''}`
  }
  
  // 部门选择相关状态
  const [selectedDepartment, setSelectedDepartment] = useState<string | null>(null)
  const [_selectedSubDepartment, setSelectedSubDepartment] = useState<string | null>(null)

  const { data: userData, isLoading } = useQuery(
    ['user', id],
    () => userService.getUser(Number(id!)),
    {
      enabled: !!id,
      onSuccess: (data) => {
        // 解析销售单位
        const { department, subDepartment } = parseSalesUnit(data.sales_unit)
        setSelectedDepartment(department)
        setSelectedSubDepartment(subDepartment)
        
        form.setFieldsValue({
          real_name: data.real_name,
          email: data.email,
          phone: data.phone,
          department: department,
          sub_department: subDepartment,
          sales_unit: data.sales_unit,
          is_active: data.is_active,
        })
      },
    }
  )

  const updateMutation = useMutation(
    (data: UserUpdate) => userService.updateUser(Number(id!), data),
    {
      onSuccess: () => {
        message.success('用户更新成功')
        queryClient.invalidateQueries('users')
        queryClient.invalidateQueries(['user', id])
        navigate(getBackUrl())
      },
      onError: (error: unknown) => {
        message.error(extractErrorMessage(error, '更新失败'))
      },
    }
  )

  const uploadAvatarMutation = useMutation(
    (file: File) => uploadService.uploadAvatar(file),
    {
      onSuccess: async () => {
        message.success('头像上传成功')
        queryClient.invalidateQueries(['user', id])
        queryClient.invalidateQueries('users')
      },
      onError: (error: unknown) => {
        message.error(extractErrorMessage(error, '头像上传失败'))
      },
    }
  )

  const addRoleMutation = useMutation(
    (data: { role: string; sales_unit?: string }) => userService.addUserRole(Number(id!), data),
    {
      onSuccess: () => {
        message.success('角色添加成功')
        queryClient.invalidateQueries(['user', id])
        queryClient.invalidateQueries('users')
        setSelectedRole('')
      },
      onError: (error: unknown) => {
        message.error(extractErrorMessage(error, '添加角色失败'))
      },
    }
  )

  const removeRoleMutation = useMutation(
    (roleId: number) => userService.removeUserRole(Number(id!), roleId),
    {
      onSuccess: () => {
        message.success('角色删除成功')
        queryClient.invalidateQueries(['user', id])
        queryClient.invalidateQueries('users')
      },
      onError: (error: unknown) => {
        message.error(extractErrorMessage(error, '删除角色失败'))
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
      is_active: values.is_active,
    }
    
    updateMutation.mutate(updateData)
  }

  // 只有总管可以编辑用户
  const { getCurrentRole } = useAuth()
  const currentRole = getCurrentRole()
  if (currentRole?.role !== 'manager') {
    return <div>无权访问</div>
  }

  if (isLoading) {
    return <Loading tip="加载用户信息..." />
  }

  if (!userData) {
    return (
      <Result
        status="404"
        title="404"
        subTitle="用户不存在"
        extra={
          <Button type="primary" onClick={() => navigate(getBackUrl())}>
            返回用户列表
          </Button>
        }
      />
    )
  }

  return (
    <div>
      <PageBreadcrumb
        items={[
          { title: '用户管理', to: getBackUrl() },
          { title: `编辑 · ${userData.username}` },
        ]}
      />

      <Card title={`编辑用户 - ${userData.username}`}>
        {/* 头像上传区域 */}
        <div style={{ marginBottom: 24, paddingBottom: 24, borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Upload
              accept="image/jpeg,image/png,image/gif,image/webp"
              showUploadList={false}
              disabled={uploadAvatarMutation.isLoading}
              beforeUpload={beforeAvatarUpload}
            >
              <div style={{ position: 'relative', cursor: 'pointer' }}>
                <Avatar
                  size={80}
                  src={userData.avatar ? uploadService.getAvatarUrl(userData.avatar) : undefined}
                  style={{
                    background: userData.avatar ? 'transparent' : 'linear-gradient(135deg, #1890ff 0%, #36cfc9 100%)',
                    border: '3px solid #fff',
                    boxShadow: '0 4px 12px rgba(24, 144, 255, 0.3)',
                  }}
                  icon={!userData.avatar ? <UserOutlined /> : undefined}
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
            <div>
              <div style={{ fontSize: '16px', fontWeight: 500, marginBottom: 4 }}>
                {userData.real_name || userData.username}
              </div>
              <div style={{ fontSize: '14px', color: '#8c8c8c' }}>
                点击头像或相机图标上传新头像
              </div>
              {uploadAvatarMutation.isLoading && (
                <div style={{ fontSize: '12px', color: '#1890ff', marginTop: 4 }}>
                  上传中...
                </div>
              )}
            </div>
          </div>
        </div>

        <Form
          form={form}
          onFinish={handleSubmit}
          layout="vertical"
        >
          <Form.Item label="用户名">
            <Input value={userData.username} disabled />
          </Form.Item>

          <Form.Item label="角色管理">
            <div>
              {/* 显示所有角色 */}
              {userData.roles && userData.roles.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <Space size={[8, 8]} wrap>
                    {userData.roles.map((r) => (
                      <Tag
                        key={r.id}
                        color={
                          r.role === 'manager' ? 'red' :
                          r.approval_status === 'pending' ? 'orange' :
                          r.approval_status === 'rejected' ? 'default' :
                          r.is_current ? 'blue' : 'cyan'
                        }
                        style={{
                          padding: '4px 12px',
                          fontSize: '13px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                        }}
                      >
                        <span>
                          {UserRoleLabels[r.role as keyof typeof UserRoleLabels] || r.role}
                          {r.is_current && ' (当前)'}
                          {r.approval_status === 'pending' && ' (待审核)'}
                          {r.approval_status === 'rejected' && ' (已拒绝)'}
                        </span>
                        {r.approval_status === 'approved' && (
                          <Popconfirm
                            title="确定要删除这个角色吗？"
                            description="删除后该用户将无法使用此角色权限"
                            onConfirm={() => removeRoleMutation.mutate(r.id)}
                            okText="确定"
                            cancelText="取消"
                          >
                            <DeleteOutlined
                              style={{ cursor: 'pointer', color: '#ff4d4f' }}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </Popconfirm>
                        )}
                      </Tag>
                    ))}
                  </Space>
                </div>
              )}
              
              {/* 添加角色 */}
              <Space.Compact style={{ width: '100%' }}>
                <Select
                  placeholder="选择要添加的角色"
                  style={{ flex: 1 }}
                  value={selectedRole}
                  onChange={(value) => setSelectedRole(value)}
                  allowClear
                >
                  {Object.entries(UserRoleLabels).map(([value, label]) => {
                    // 检查该角色是否已存在
                    const exists = userData.roles?.some(r => r.role === value)
                    return (
                      <Option key={value} value={value} disabled={exists}>
                        {label} {exists && '(已存在)'}
                      </Option>
                    )
                  })}
                </Select>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    if (!selectedRole) {
                      message.warning('请先选择角色')
                      return
                    }
                    // 检查是否已存在
                    const exists = userData.roles?.some(r => r.role === selectedRole)
                    if (exists) {
                      message.warning('该角色已存在')
                      return
                    }
                    addRoleMutation.mutate({
                      role: selectedRole,
                      sales_unit: userData.sales_unit,
                    })
                  }}
                  loading={addRoleMutation.isLoading}
                >
                  添加角色
                </Button>
              </Space.Compact>
            </div>
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
              { pattern: /^1[3-9]\d{9}$/, message: '请输入有效的手机号' },
            ]}
          >
            <Input placeholder="请输入手机号" />
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

          <Form.Item
            name="is_active"
            label="状态"
            valuePropName="checked"
          >
            <Switch checkedChildren="活跃" unCheckedChildren="已禁用" />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={updateMutation.isLoading}>
                提交
              </Button>
              <Button onClick={() => navigate(getBackUrl())}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}

export default UserEditPage

