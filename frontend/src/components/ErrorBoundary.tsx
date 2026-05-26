/**
 * 错误边界组件
 */
import React from 'react'
import { Result, Button } from 'antd'
import { useNavigate } from 'react-router-dom'

interface ErrorBoundaryProps {
  error?: Error | null
  onRetry?: () => void
  title?: string
  subTitle?: string
}

const ErrorBoundary: React.FC<ErrorBoundaryProps> = ({ 
  error, 
  onRetry,
  title = '加载失败',
  subTitle
}) => {
  const navigate = useNavigate()

  // 提取错误消息和状态码
  const getErrorInfo = (): { message: string; status: 'error' | '403' | '404' | '500' } => {
    if (subTitle) return { message: subTitle, status: 'error' }
    if (!error) return { message: '页面加载失败，请稍后重试', status: 'error' }
    
    // 如果是 AxiosError，提取响应数据和状态码
    const axiosError = error as any
    if (axiosError?.response) {
      const statusCode = axiosError.response.status
      const data = axiosError.response.data
      
      let message = '页面加载失败，请稍后重试'
      if (Array.isArray(data?.detail)) {
        message = data.detail.map((item: any) => item.msg || JSON.stringify(item)).join('; ')
      } else if (typeof data?.detail === 'string') {
        message = data.detail
      }
      
      // 根据状态码返回不同的状态
      if (statusCode === 403) {
        return { message: message || '无权访问此资源', status: '403' }
      } else if (statusCode === 404) {
        return { message: message || '资源不存在', status: '404' }
      } else if (statusCode >= 500) {
        return { message: message || '服务器错误，请稍后重试', status: '500' }
      }
      
      return { message, status: 'error' }
    }
    
    return { message: error.message || '页面加载失败，请稍后重试', status: 'error' }
  }

  const { message: errorMessage, status: errorStatus } = getErrorInfo()

  return (
    <Result
      status={errorStatus === '403' ? '403' : errorStatus === '404' ? '404' : errorStatus === '500' ? '500' : 'error'}
      title={errorStatus === '403' ? '403' : title}
      subTitle={errorMessage}
      extra={[
        onRetry && (
          <Button type="primary" key="retry" onClick={onRetry}>
            重试
          </Button>
        ),
        <Button key="back" onClick={() => navigate(-1)}>
          返回
        </Button>,
      ].filter(Boolean)}
    />
  )
}

export default ErrorBoundary

