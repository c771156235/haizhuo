/**
 * 选项配置管理页面（仅总管可访问）
 */
import { useState } from 'react'
import {
  Card,
  Tabs,
  Button,
  Space,
  message,
  Table,
  Modal,
  Form,
  Input,
  InputNumber,
  Switch,
  Select,
  Tag,
  Popconfirm,
  Tooltip,
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import {
  optionConfigService,
  OptionConfig,
  OptionConfigCreate,
  OptionConfigUpdate,
  OptionType,
  MemberMenuVisibilityItem,
} from '../services/optionConfig'
import EmptyState from '../components/EmptyState'
import { extractErrorMessage } from '../utils/errorHandler'

const { TextArea } = Input
const MEMBER_MENU_VISIBILITY_TAB: OptionType = 'member_menu_visibility'

const OptionConfigList = () => {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<OptionType>('requirement_direction')
  const [editingOption, setEditingOption] = useState<OptionConfig | null>(null)
  const [parentOption, setParentOption] = useState<OptionConfig | null>(null)
  const [isModalVisible, setIsModalVisible] = useState(false)
  const [form] = Form.useForm()
  const [updatingMenuKey, setUpdatingMenuKey] = useState<string | null>(null)

  // 获取选项配置列表（管理接口）
  const { data: optionData, isLoading, error } = useQuery(
    ['option-configs-admin', activeTab],
    () => optionConfigService.getOptionConfigsAdmin(activeTab),
    {
      enabled: activeTab !== MEMBER_MENU_VISIBILITY_TAB,
      onError: (err: any) => {
        const { logError, extractErrorMessage } = require('../utils/errorHandler')
        logError('获取选项配置失败', err)
        message.error(extractErrorMessage(err, '获取选项配置失败，请稍后重试'))
      },
      onSuccess: (data) => {
        console.log('获取选项配置成功:', { activeTab, itemsCount: data?.items?.length || 0, data })
      },
    }
  )

  const options = optionData?.items || []

  const { data: memberMenuVisibilityData, isLoading: isMemberMenuVisibilityLoading } = useQuery(
    ['member-menu-visibility'],
    () => optionConfigService.getMemberMenuVisibility(),
    {
      enabled: activeTab === MEMBER_MENU_VISIBILITY_TAB,
    }
  )
  
  // 调试日志
  console.log('选项配置数据:', { activeTab, isLoading, error, optionsCount: options.length, optionData })

  // 创建选项
  const createMutation = useMutation(
    (data: OptionConfigCreate) => optionConfigService.createOptionConfig(data),
    {
      onSuccess: () => {
        message.success('选项创建成功')
        queryClient.invalidateQueries(['option-configs-admin', activeTab])
        queryClient.invalidateQueries(['option-configs', activeTab]) // 同时刷新公开接口的缓存
        setIsModalVisible(false)
        form.resetFields()
        setEditingOption(null)
        setParentOption(null)
      },
      onError: (error: unknown) => {
        message.error(extractErrorMessage(error, '创建失败'))
      },
    }
  )

  // 更新选项
  const updateMutation = useMutation(
    ({ id, data }: { id: number; data: OptionConfigUpdate }) =>
      optionConfigService.updateOptionConfig(id, data),
    {
      onSuccess: () => {
        message.success('选项更新成功')
        queryClient.invalidateQueries(['option-configs-admin', activeTab])
        queryClient.invalidateQueries(['option-configs', activeTab])
        setIsModalVisible(false)
        form.resetFields()
        setEditingOption(null)
        setParentOption(null)
      },
      onError: (error: unknown) => {
        message.error(extractErrorMessage(error, '更新失败'))
      },
    }
  )

  // 切换选项状态（启用/禁用）
  const toggleStatusMutation = useMutation(
    ({ id, isActive }: { id: number; isActive: boolean }) =>
      optionConfigService.updateOptionConfig(id, { is_active: isActive }),
    {
      onSuccess: (_, variables) => {
        message.success(variables.isActive ? '选项已启用' : '选项已禁用')
        queryClient.invalidateQueries(['option-configs-admin', activeTab])
        queryClient.invalidateQueries(['option-configs', activeTab])
      },
      onError: (error: unknown) => {
        message.error(extractErrorMessage(error, '操作失败'))
      },
    }
  )

  // 更新成员菜单可见性
  const updateMemberMenuVisibilityMutation = useMutation(
    ({ menuKey, isVisible }: { menuKey: string; isVisible: boolean }) =>
      optionConfigService.updateMemberMenuVisibility(menuKey, isVisible),
    {
      onSuccess: () => {
        message.success('非总管导航可见性已更新')
        queryClient.invalidateQueries(['member-menu-visibility'])
      },
      onError: (error: unknown) => {
        message.error(extractErrorMessage(error, '更新失败'))
      },
      onSettled: () => {
        setUpdatingMenuKey(null)
      },
    }
  )

  // 获取父选项列表（用于下拉选择）
  // 使用 0 作为"无父选项"的特殊值，因为 null 不能作为 Select 的 value
  const getParentOptions = (excludeId?: number): Array<{ value: number | 0; label: string; level: number }> => {
    const result: Array<{ value: number | 0; label: string; level: number }> = [
      { value: 0, label: '无（顶级选项）', level: 0 },
    ]
    const addOptions = (items: OptionConfig[], level: number = 1) => {
      items.forEach((item) => {
        if (item.id !== excludeId) {
          result.push({
            value: item.id,
            label: `${'  '.repeat(level - 1)}${item.label}`,
            level: item.level,
          })
          if (item.children && item.children.length > 0) {
            addOptions(item.children, level + 1)
          }
        }
      })
    }
    addOptions(options)
    return result
  }

  // 处理创建/编辑
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      // 将 0 转换为 null（0 表示无父选项，但后端期望 null）
      const parentId = values.parent_id === 0 ? null : values.parent_id
      
      if (editingOption) {
        // 更新
        await updateMutation.mutateAsync({
          id: editingOption.id,
          data: {
            value: values.value,
            label: values.label,
            parent_id: parentId,
            sort_order: values.sort_order,
            is_active: values.is_active,
            description: values.description,
          },
        })
      } else {
        // 创建
        await createMutation.mutateAsync({
          option_type: activeTab,
          value: values.value,
          label: values.label,
          parent_id: parentId,
          sort_order: values.sort_order ?? 0,
          is_active: values.is_active ?? true,
          description: values.description,
        })
      }
    } catch (error) {
      // 表单验证失败
    }
  }

  // 打开创建对话框
  const handleCreate = (parent?: OptionConfig) => {
    setEditingOption(null)
    setParentOption(parent || null)
    form.setFieldsValue({
      parent_id: parent?.id || 0, // 使用 0 代替 null
      sort_order: 0,
      is_active: true,
    })
    setIsModalVisible(true)
  }

  // 打开编辑对话框
  const handleEdit = (option: OptionConfig) => {
    setEditingOption(option)
    setParentOption(null)
    form.setFieldsValue({
      value: option.value,
      label: option.label,
      parent_id: option.parent_id || 0, // 将 null 转换为 0
      sort_order: option.sort_order,
      is_active: option.is_active,
      description: option.description,
    })
    setIsModalVisible(true)
  }

  // 处理状态切换
  const handleToggleStatus = async (id: number, currentStatus: boolean) => {
    await toggleStatusMutation.mutateAsync({ id, isActive: !currentStatus })
  }

  // 表格列定义（树形结构）
  const columns = [
    {
      title: '选项标签',
      dataIndex: 'label',
      key: 'label',
      width: '25%',
      render: (text: string, record: OptionConfig) => (
        <span style={{ fontWeight: record.level === 1 ? 600 : 'normal' }}>{text}</span>
      ),
    },
    {
      title: '选项值',
      dataIndex: 'value',
      key: 'value',
      width: '20%',
    },
    {
      title: '层级',
      dataIndex: 'level',
      key: 'level',
      width: '8%',
      align: 'center' as const,
    },
    {
      title: '排序',
      dataIndex: 'sort_order',
      key: 'sort_order',
      width: '8%',
      align: 'center' as const,
    },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      width: '10%',
      align: 'center' as const,
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'green' : 'red'} icon={isActive ? <CheckCircleOutlined /> : <CloseCircleOutlined />}>
          {isActive ? '启用' : '禁用'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: '29%',
      render: (_: any, record: OptionConfig) => (
        <Space size="small">
          <Tooltip title="编辑">
            <Button
              type="link"
              size="small"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          {record.level < 4 && (
            <Tooltip title="添加子选项">
              <Button
                type="link"
                size="small"
                icon={<PlusOutlined />}
                onClick={() => handleCreate(record)}
              />
            </Tooltip>
          )}
          <Popconfirm
            title={record.is_active ? "确定要禁用该选项吗？" : "确定要启用该选项吗？"}
            description={
              record.is_active
                ? "禁用后该选项将不再显示在选择列表中，但不会删除已使用的数据。"
                : "启用后该选项将重新显示在选择列表中。"
            }
            onConfirm={() => handleToggleStatus(record.id, record.is_active)}
            okText="确定"
            cancelText="取消"
          >
            <Tooltip title={record.is_active ? "禁用" : "启用"}>
              <Button
                type="link"
                size="small"
                danger={record.is_active}
                icon={record.is_active ? <DeleteOutlined /> : <CheckCircleOutlined />}
                style={record.is_active ? {} : { color: '#52c41a' }}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const tabLabels = {
    requirement_direction: '客户需求方向',
    product: '具体产品',
    member_menu_visibility: '非总管导航开关',
  }

  return (
    <div style={{ padding: '24px' }}>
      <Card
        title="选项配置管理"
        extra={
          activeTab !== MEMBER_MENU_VISIBILITY_TAB ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => handleCreate()}>
              添加顶级选项
            </Button>
          ) : null
        }
      >
        <Tabs
          activeKey={activeTab}
          onChange={(key) => {
            setActiveTab(key as OptionType)
            setIsModalVisible(false)
            form.resetFields()
            setEditingOption(null)
            setParentOption(null)
          }}
          items={[
            {
              key: 'requirement_direction',
              label: tabLabels.requirement_direction,
              children:
                !isLoading && options.length === 0 ? (
                  <EmptyState description="暂无选项配置，点击上方按钮添加" />
                ) : (
                  <Table
                    loading={isLoading}
                    columns={columns}
                    dataSource={options}
                    rowKey="id"
                    pagination={false}
                    size="middle"
                    defaultExpandAllRows={true}
                  />
                ),
            },
            {
              key: 'product',
              label: tabLabels.product,
              children:
                !isLoading && options.length === 0 ? (
                  <EmptyState description="暂无选项配置，点击上方按钮添加" />
                ) : (
                  <Table
                    loading={isLoading}
                    columns={columns}
                    dataSource={options}
                    rowKey="id"
                    pagination={false}
                    size="middle"
                    defaultExpandAllRows={true}
                  />
                ),
            },
            {
              key: 'member_menu_visibility',
              label: tabLabels.member_menu_visibility,
              children: (
                <Table<MemberMenuVisibilityItem>
                  loading={isMemberMenuVisibilityLoading}
                  rowKey="menu_key"
                  pagination={false}
                  dataSource={memberMenuVisibilityData?.items || []}
                  columns={[
                    {
                      title: '模块名称',
                      dataIndex: 'label',
                      key: 'label',
                    },
                    {
                      title: '菜单路径',
                      dataIndex: 'menu_key',
                      key: 'menu_key',
                    },
                    {
                      title: '非总管可见',
                      key: 'is_visible',
                      render: (_, record) => (
                        <Switch
                          checked={record.is_visible}
                          checkedChildren="显示"
                          unCheckedChildren="隐藏"
                          loading={updatingMenuKey === record.menu_key}
                          onChange={(checked) => {
                            setUpdatingMenuKey(record.menu_key)
                            updateMemberMenuVisibilityMutation.mutate({
                              menuKey: record.menu_key,
                              isVisible: checked,
                            })
                          }}
                        />
                      ),
                    },
                  ]}
                />
              ),
            },
          ]}
        />
      </Card>

      {/* 创建/编辑对话框 */}
      <Modal
        title={editingOption ? '编辑选项' : parentOption ? `添加子选项（${parentOption.label}）` : '添加选项'}
        open={isModalVisible}
        onOk={handleSubmit}
        onCancel={() => {
          setIsModalVisible(false)
          form.resetFields()
          setEditingOption(null)
          setParentOption(null)
        }}
        confirmLoading={createMutation.isLoading || updateMutation.isLoading}
        width={600}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            parent_id: 0, // 使用 0 代替 null
            sort_order: 0,
            is_active: true,
          }}
        >
          <Form.Item
            name="value"
            label="选项值"
            rules={[{ required: true, message: '请输入选项值' }, { max: 200, message: '选项值不能超过200个字符' }]}
            tooltip="选项值用于存储和匹配，建议使用英文或拼音，例如：computing-power"
            initialValue=""
          >
            <Input placeholder="请输入选项值" disabled={!!editingOption} />
          </Form.Item>

          <Form.Item
            name="label"
            label="选项标签"
            rules={[{ required: true, message: '请输入选项标签' }, { max: 200, message: '选项标签不能超过200个字符' }]}
            tooltip="选项标签用于显示，例如：算力"
          >
            <Input placeholder="请输入选项标签" />
          </Form.Item>

          <Form.Item
            name="parent_id"
            label="父选项"
            tooltip={editingOption ? '修改父选项可能会影响选项的层级关系' : '选择父选项以创建子选项'}
          >
            <Select
              placeholder="请选择父选项（留空为顶级选项）"
              options={getParentOptions(editingOption?.id)}
              showSearch
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>

          <Form.Item name="sort_order" label="排序顺序" tooltip="数字越小越靠前">
            <InputNumber min={0} style={{ width: '100%' }} placeholder="排序顺序" />
          </Form.Item>

          <Form.Item name="is_active" label="启用状态" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>

          <Form.Item
            name="description"
            label="描述"
            rules={[{ max: 1000, message: '描述不能超过1000个字符' }]}
          >
            <TextArea rows={3} placeholder="请输入选项描述（可选）" maxLength={1000} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default OptionConfigList

