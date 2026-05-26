/**
 * 组管理页面
 */
import { useState } from 'react'
import { Table, Tag, Button, Space, message, Popconfirm, Form, Input, Select, Modal, Descriptions, Alert, Tooltip, Typography } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, UserOutlined } from '@ant-design/icons'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { groupService, Group, GroupCreate, GroupUpdate, GroupMemberAdd, GroupMemberRemove, GroupMemberInfo } from '../services/group'
import { userService, User } from '../services/user'
import { UserRole } from '../types/user'
import EmptyState from '../components/EmptyState'
import dayjs from 'dayjs'
import { extractErrorMessage } from '../utils/errorHandler'

const { TextArea } = Input
const { Title } = Typography

const GroupList = () => {
  const queryClient = useQueryClient()
  const [searchForm] = Form.useForm<{ search?: string }>()
  const [pagination, setPagination] = useState({ page: 1, page_size: 10 })
  const [searchText, setSearchText] = useState('')
  
  // 模态框状态
  const [createModalVisible, setCreateModalVisible] = useState(false)
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [memberModalVisible, setMemberModalVisible] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null)
  
  // 表单
  const [createForm] = Form.useForm<GroupCreate>()
  const [editForm] = Form.useForm<GroupUpdate>()
  const [memberForm] = Form.useForm<GroupMemberAdd>()

  const { data: groupsData, isLoading, error } = useQuery(
    ['groups', pagination.page, pagination.page_size, searchText],
    () => groupService.getGroups({
      page: pagination.page,
      page_size: pagination.page_size,
      search: searchText || undefined,
    })
  )

  const groups = groupsData?.items || []
  const total = groupsData?.total || 0

  // 获取所有组长和成员（用于选择）
  // 注意：page_size最大为100，如果用户超过100个，建议使用搜索功能
  const { data: leadersData } = useQuery(
    ['leaders'],
    () => userService.getUsers({ role: UserRole.TEAM_LEADER, page: 1, page_size: 100 })
  )
  const { data: membersData } = useQuery(
    ['members'],
    () => userService.getUsers({ role: UserRole.MEMBER, page: 1, page_size: 100 })
  )
  const leaders = leadersData?.items || []
  const allMembers = membersData?.items || []
  
  // 获取可添加的成员列表（允许成员加入多个组，只排除当前组已有的成员）
  const getAvailableMembers = (currentGroupId?: number): User[] => {
    // 获取当前组已有的成员ID
    const currentGroupMemberIds = currentGroupId && selectedGroup
      ? (selectedGroup.members?.map(m => m.id) || [])
      : []
    
    // 排除当前组已有的成员，其他成员都可以添加（包括已在其他组的成员）
    return allMembers.filter((member: User) => !currentGroupMemberIds.includes(member.id))
  }
  
  // 获取可添加的组长列表（排除已在其他组的组长）
  // 创建组时：排除所有已有组的组长
  // 编辑组时：排除在其他组中的组长，但保留当前组的组长
  const getAvailableLeaders = (currentGroupId?: number): User[] => {
    // 获取当前组的组长ID列表（用于编辑组时保留当前组长）
    const currentGroupLeaderIds = currentGroupId && selectedGroup 
      ? (selectedGroup.leader_ids || (selectedGroup.leader_id ? [selectedGroup.leader_id] : []))
      : []
    
    return leaders.filter((leader: User) => {
      // 如果是编辑组，且该组长是当前组的组长，始终保留
      if (currentGroupId && currentGroupLeaderIds.includes(leader.id)) {
        return true
      }
      // 如果组长没有组信息，说明可以添加
      if (!leader.leader_groups || leader.leader_groups.length === 0) {
        return true
      }
      // 如果是编辑组，保留当前组的组长（通过组ID检查）
      if (currentGroupId) {
        return leader.leader_groups.some((group) => group.id === currentGroupId)
      }
      // 创建组时，排除所有已有组的组长
      return false
    })
  }

  const handleTableChange = (page: number, pageSize: number) => {
    setPagination({ page, page_size: pageSize })
  }

  const handleSearch = (values: { search?: string }): void => {
    setSearchText(values.search || '')
    setPagination({ page: 1, page_size: pagination.page_size })
  }

  const createMutation = useMutation((data: GroupCreate) => groupService.createGroup(data), {
    onSuccess: () => {
      message.success('组创建成功')
      // 使用 refetchQueries 保持当前分页状态
      queryClient.refetchQueries(['groups', pagination.page, pagination.page_size, searchText])
      queryClient.invalidateQueries('allGroups')
      setCreateModalVisible(false)
      createForm.resetFields()
    },
    onError: (error: any) => {
      message.error(extractErrorMessage(error, '创建失败'))
    },
  })

  const updateMutation = useMutation(
    ({ id, data }: { id: number; data: GroupUpdate }) => groupService.updateGroup(id, data),
    {
      onSuccess: () => {
        message.success('组更新成功')
        // 使用 refetchQueries 保持当前分页状态
        queryClient.refetchQueries(['groups', pagination.page, pagination.page_size, searchText])
        queryClient.invalidateQueries('allGroups')
        setEditModalVisible(false)
        setSelectedGroup(null)
        editForm.resetFields()
      },
      onError: (error: any) => {
        message.error(extractErrorMessage(error, '更新失败'))
      },
    }
  )

  const deleteMutation = useMutation((id: number) => groupService.deleteGroup(id), {
    onSuccess: () => {
      message.success('组已删除')
      // 使用 refetchQueries 保持当前分页状态
      queryClient.refetchQueries(['groups', pagination.page, pagination.page_size, searchText])
      queryClient.invalidateQueries('allGroups')
    },
    onError: (error: any) => {
      message.error(extractErrorMessage(error, '删除失败'))
    },
  })

  const addMemberMutation = useMutation(
    ({ id, data }: { id: number; data: GroupMemberAdd }) => groupService.addGroupMembers(id, data),
    {
      onSuccess: async (_, variables) => {
        message.success('成员添加成功')
        // 使用 refetchQueries 保持当前分页状态
        queryClient.refetchQueries(['groups', pagination.page, pagination.page_size, searchText])
        queryClient.invalidateQueries('allGroups')
        // 如果当前正在查看该组的成员管理，重新获取组详情以更新成员列表
        if (selectedGroup && selectedGroup.id === variables.id) {
          try {
            const updatedGroup = await groupService.getGroup(variables.id)
            setSelectedGroup(updatedGroup)
          } catch (error) {
            const { logError } = require('../utils/errorHandler')
            logError('获取组详情失败', error)
          }
        }
        // 重置表单，但不关闭模态框，让用户可以看到新添加的成员
        memberForm.resetFields()
      },
      onError: (error: any) => {
        message.error(extractErrorMessage(error, '添加成员失败'))
      },
    }
  )

  const removeMemberMutation = useMutation(
    ({ id, data }: { id: number; data: GroupMemberRemove }) => groupService.removeGroupMembers(id, data),
    {
      onSuccess: async (_, variables) => {
        message.success('成员移除成功')
        // 使用 refetchQueries 保持当前分页状态
        queryClient.refetchQueries(['groups', pagination.page, pagination.page_size, searchText])
        queryClient.invalidateQueries('allGroups')
        // 如果当前正在查看该组的成员管理，重新获取组详情以更新成员列表
        if (selectedGroup && selectedGroup.id === variables.id) {
          try {
            const updatedGroup = await groupService.getGroup(variables.id)
            setSelectedGroup(updatedGroup)
          } catch (error) {
            // 如果获取失败，至少从列表中移除该成员
            if (selectedGroup.members) {
              const removedUserIds = variables.data.user_ids
              setSelectedGroup({
                ...selectedGroup,
                members: selectedGroup.members.filter(m => !removedUserIds.includes(m.id)),
                member_count: selectedGroup.member_count - removedUserIds.length,
              })
            }
          }
        }
      },
      onError: (error: any) => {
        message.error(extractErrorMessage(error, '移除成员失败'))
      },
    }
  )

  const handleCreate = (values: GroupCreate) => {
    createMutation.mutate(values)
  }

  const handleEdit = (group: Group) => {
    setSelectedGroup(group)
    editForm.setFieldsValue({
      name: group.name,
      description: group.description,
      leader_ids: group.leader_ids || (group.leader_id ? [group.leader_id] : []),
    })
    setEditModalVisible(true)
  }

  const handleUpdate = (values: GroupUpdate) => {
    if (selectedGroup) {
      updateMutation.mutate({ id: selectedGroup.id, data: values })
    }
  }

  const handleDelete = (id: number) => {
    deleteMutation.mutate(id)
  }

  const handleManageMembers = (group: Group) => {
    setSelectedGroup(group)
    setMemberModalVisible(true)
  }

  const handleAddMembers = (values: GroupMemberAdd) => {
    if (selectedGroup) {
      addMemberMutation.mutate({ id: selectedGroup.id, data: values })
    }
  }

  const handleRemoveMember = (groupId: number, userId: number) => {
    removeMemberMutation.mutate({
      id: groupId,
      data: { user_ids: [userId] },
    })
  }

  const columns = [
    {
      title: '组名',
      dataIndex: 'name',
      key: 'name',
      width: 150,
      fixed: 'left' as const,
    },
    {
      title: '组长',
      dataIndex: 'leader_names',
      key: 'leader_names',
      width: 200,
      render: (_names: string[], record: Group) => {
        if (record.leader_names && record.leader_names.length > 0) {
          return (
            <Space size={[0, 4]} wrap>
              {record.leader_names.map((name, index) => (
                <Tag key={index} color="blue">{name}</Tag>
              ))}
            </Space>
          )
        }
        // 向后兼容：如果没有 leader_names，使用 leader_name
        if (record.leader_name) {
          return <Tag color="blue">{record.leader_name}</Tag>
        }
        return <Tag color="default">未设置</Tag>
      },
    },
    {
      title: '成员数量',
      dataIndex: 'member_count',
      key: 'member_count',
      width: 100,
      render: (count: number) => <Tag color="blue">{count}</Tag>,
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      width: 200,
      ellipsis: true,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (text: string) => dayjs(text).format('YYYY-MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      fixed: 'right' as const,
      align: 'center' as const,
      render: (_: any, record: Group) => (
        <Space size={4} style={{ justifyContent: 'center', width: '100%' }}>
          <Tooltip title="编辑">
            <Button 
              type="text" 
              size="small"
              icon={<EditOutlined />} 
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          <Tooltip title="成员管理">
            <Button 
              type="text" 
              size="small"
              icon={<UserOutlined />} 
              onClick={() => handleManageMembers(record)}
            />
          </Tooltip>
          <Tooltip title="删除">
            <Popconfirm
              title="确定要删除这个组吗？"
              description="删除后无法恢复，请谨慎操作！"
              onConfirm={() => handleDelete(record.id)}
              okText="确定"
              cancelText="取消"
              okButtonProps={{ danger: true }}
            >
              <Button type="text" size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <Title level={3} style={{ margin: 0 }}>组管理</Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            setCreateModalVisible(true)
            createForm.resetFields()
          }}
        >
          创建组
        </Button>
      </div>

      {/* 搜索和筛选 */}
      {(
          <div style={{marginBottom: 16, display:'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
            <Form
              form={searchForm}
              layout="inline"
              onFinish={handleSearch}
              style={{ flex: 1 }}
            >
              <Form.Item name="search">
                <Input
                  placeholder="搜索组名"
                  prefix={<SearchOutlined />}
                  allowClear
                  style={{ width: 250 }}
                />
              </Form.Item>
            </Form>
                <Button type="primary" onClick={() => searchForm.submit()} icon={<SearchOutlined />}>
                  搜索
                </Button>
          </div>
      ) as any}

      {error && (
        <Alert
          message="加载失败"
          description={extractErrorMessage(error, '未知错误')}
          type="error"
          showIcon
          closable
          style={{ marginBottom: 16 }}
          action={
            <Button size="small" onClick={() => window.location.reload()}>
              刷新
            </Button>
          }
        />
      )}

      <Table
        columns={columns}
        dataSource={groups}
        loading={isLoading}
        rowKey="id"
        scroll={{ x: 'max-content' }}
        pagination={{
          current: pagination.page,
          pageSize: pagination.page_size,
          total: total,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条`,
          onChange: handleTableChange,
          onShowSizeChange: handleTableChange,
        }}
        locale={{
          emptyText: (
            <EmptyState
              description="暂无组数据"
              showCreateButton={true}
              onCreateClick={() => {
                setCreateModalVisible(true)
                createForm.resetFields()
              }}
              createButtonText="创建组"
            />
          ),
        }}
      />

      {/* 创建组模态框 */}
      <Modal
        title="新建组"
        open={createModalVisible}
        onCancel={() => {
          setCreateModalVisible(false)
          createForm.resetFields()
        }}
        onOk={() => createForm.submit()}
        confirmLoading={createMutation.isLoading}
        width={600}
      >
        <Form
          form={createForm}
          onFinish={handleCreate}
          layout="vertical"
        >
          <Form.Item
            name="name"
            label="组名"
            rules={[{ required: true, message: '请输入组名' }]}
          >
            <Input placeholder="请输入组名" />
          </Form.Item>
          <Form.Item
            name="description"
            label="描述"
          >
            <TextArea rows={3} placeholder="请输入组描述" />
          </Form.Item>
          <Form.Item
            name="leader_ids"
            label="组长"
            help="只能选择未加入任何组的组长。如需添加已在其他组的组长，请先将组长从原组移除。"
          >
            <Select
              mode="multiple"
              placeholder="请选择组长（可选，可多选）"
              allowClear
              showSearch
              filterOption={(input, option) =>
                String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            >
              {getAvailableLeaders().map((leader: User) => (
                <Select.Option key={leader.id} value={leader.id} label={leader.real_name}>
                  {leader.real_name} ({leader.username})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item
            name="member_ids"
            label="成员"
            help="可以选择任意成员，成员可以同时加入多个组。"
          >
            <Select
              mode="multiple"
              placeholder="请选择成员（可选）"
              showSearch
              filterOption={(input, option) =>
                String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            >
              {getAvailableMembers().map((member: User) => (
                <Select.Option key={member.id} value={member.id} label={member.real_name}>
                  {member.real_name} ({member.username})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑组模态框 */}
      <Modal
        title="编辑组"
        open={editModalVisible}
        onCancel={() => {
          setEditModalVisible(false)
          setSelectedGroup(null)
          editForm.resetFields()
        }}
        onOk={() => editForm.submit()}
        confirmLoading={updateMutation.isLoading}
        width={600}
      >
        <Form
          form={editForm}
          onFinish={handleUpdate}
          layout="vertical"
        >
          <Form.Item
            name="name"
            label="组名"
            rules={[{ required: true, message: '请输入组名' }]}
          >
            <Input placeholder="请输入组名" />
          </Form.Item>
          <Form.Item
            name="description"
            label="描述"
          >
            <TextArea rows={3} placeholder="请输入组描述" />
          </Form.Item>
          <Form.Item
            name="leader_ids"
            label="组长"
            help="只能选择未加入任何组的组长。当前组的组长会保留在列表中。如需添加已在其他组的组长，请先将组长从原组移除。"
          >
            <Select
              mode="multiple"
              placeholder="请选择组长（可选，可多选，清空可移除所有组长）"
              allowClear
              showSearch
              filterOption={(input, option) =>
                String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            >
              {getAvailableLeaders(selectedGroup?.id).map((leader: User) => (
                <Select.Option key={leader.id} value={leader.id} label={leader.real_name}>
                  {leader.real_name} ({leader.username})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
        </Form>
      </Modal>

      {/* 成员管理模态框 */}
      <Modal
        title={`成员管理 - ${selectedGroup?.name}`}
        open={memberModalVisible}
        onCancel={() => {
          setMemberModalVisible(false)
          setSelectedGroup(null)
          memberForm.resetFields()
        }}
        footer={null}
        width={700}
      >
        {selectedGroup && (
          <>
            <Descriptions bordered size="small" style={{ marginBottom: 16 }}>
              <Descriptions.Item label="组名">{selectedGroup.name}</Descriptions.Item>
              <Descriptions.Item label="组长">
                {selectedGroup.leader_names && selectedGroup.leader_names.length > 0 ? (
                  <Space size={[0, 4]} wrap>
                    {selectedGroup.leader_names.map((name, index) => (
                      <Tag key={index} color="blue">{name}</Tag>
                    ))}
                  </Space>
                ) : selectedGroup.leader_name ? (
                  <Tag color="blue">{selectedGroup.leader_name}</Tag>
                ) : (
                  '未设置'
                )}
              </Descriptions.Item>
              <Descriptions.Item label="成员数量">{selectedGroup.member_count}</Descriptions.Item>
            </Descriptions>

            <div style={{ marginBottom: 16 }}>
              <h4>当前成员列表</h4>
              {selectedGroup.members && selectedGroup.members.length > 0 ? (
                <Table
                  dataSource={selectedGroup.members}
                  rowKey="id"
                  pagination={false}
                  size="small"
                  columns={[
                    {
                      title: '姓名',
                      dataIndex: 'real_name',
                      key: 'real_name',
                    },
                    {
                      title: '用户名',
                      dataIndex: 'username',
                      key: 'username',
                    },
                    {
                      title: '操作',
                      key: 'action',
                      render: (_: any, record: GroupMemberInfo) => (
                        <Popconfirm
                          title="确定要移除此成员吗？"
                          onConfirm={() => handleRemoveMember(selectedGroup.id, record.id)}
                          okText="确定"
                          cancelText="取消"
                        >
                          <Button type="link" danger size="small">
                            移除
                          </Button>
                        </Popconfirm>
                      ),
                    },
                  ]}
                />
              ) : (
                <EmptyState description="暂无成员" />
              )}
            </div>

            <div>
              <h4>添加成员</h4>
              <Form
                form={memberForm}
                onFinish={handleAddMembers}
                layout="vertical"
              >
                <Form.Item
                  name="user_ids"
                  label="选择成员"
                  rules={[{ required: true, message: '请选择成员' }]}
                  help="可以选择任意成员，成员可以同时加入多个组。"
                >
                  <Select
                    mode="multiple"
                    placeholder="请选择要添加的成员"
                    showSearch
                    filterOption={(input, option) =>
                      String(option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                    }
                  >
                    {getAvailableMembers(selectedGroup.id)
                      .filter((m: User) => !selectedGroup.members.some((gm) => gm.id === m.id))
                      .map((member: User) => (
                        <Select.Option key={member.id} value={member.id} label={member.real_name}>
                          {member.real_name} ({member.username})
                        </Select.Option>
                      ))}
                  </Select>
                </Form.Item>
                <Form.Item>
                  <Button type="primary" htmlType="submit" loading={addMemberMutation.isLoading}>
                    添加成员
                  </Button>
                </Form.Item>
              </Form>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}

export default GroupList

