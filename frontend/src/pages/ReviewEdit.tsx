/**
 * 编辑复盘页面
 */
import { useParams, useNavigate } from 'react-router-dom'
import { Card, Form, Input, Button, message, Space, Result } from 'antd'
import { useQuery, useMutation, useQueryClient } from 'react-query'
import { reviewService } from '../services/review'
import Loading from '../components/Loading'
import { PageBreadcrumb } from '../components/PageBreadcrumb'
import { extractErrorMessage } from '../utils/errorHandler'

const { TextArea } = Input

const ReviewEdit = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form] = Form.useForm()

  const { data: review, isLoading } = useQuery(
    ['review', id],
    () => reviewService.getReview(Number(id!)),
    {
      enabled: !!id,
      onSuccess: (data) => {
        form.setFieldsValue(data)
      },
    }
  )

  const updateMutation = useMutation(
    (data: any) => reviewService.updateReview(Number(id!), data),
    {
      onSuccess: () => {
        message.success('更新成功')
        queryClient.invalidateQueries(['review', id])
        queryClient.invalidateQueries('reviews')
        navigate(`/reviews/${id}`)
      },
      onError: (error: unknown) => {
        message.error(extractErrorMessage(error, '更新失败'))
      },
    }
  )

  if (isLoading) {
    return <Loading tip="加载复盘信息..." />
  }

  if (!review) {
    return (
      <Result
        status="404"
        title="404"
        subTitle="复盘不存在"
        extra={
          <Button type="primary" onClick={() => navigate('/reviews')}>
            返回复盘列表
          </Button>
        }
      />
    )
  }

  return (
    <div>
      <PageBreadcrumb
        items={[
          { title: '复盘管理', to: '/reviews' },
          { title: '复盘详情', to: `/reviews/${id}` },
          { title: '编辑' },
        ]}
      />

      <Card title="编辑复盘">
        <Form form={form} onFinish={(values) => updateMutation.mutate(values)} layout="vertical">
          <Form.Item name="comment" label="批注内容">
            <TextArea rows={4} />
          </Form.Item>

          <Form.Item name="review_summary" label="复盘总结">
            <TextArea rows={6} />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" loading={updateMutation.isLoading}>
                保存
              </Button>
              <Button onClick={() => navigate(`/reviews/${id}`)}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}

export default ReviewEdit

