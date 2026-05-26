/**
 * 加载组件
 */
import { Spin } from 'antd'
import { LoadingOutlined } from '@ant-design/icons'

interface LoadingProps {
  tip?: string
  size?: 'small' | 'default' | 'large'
  fullScreen?: boolean
}

const Loading: React.FC<LoadingProps> = ({ 
  tip = '加载中...', 
  size = 'large',
  fullScreen = false 
}) => {
  const antIcon = <LoadingOutlined style={{ fontSize: 24 }} spin />

  if (fullScreen) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh' 
      }}>
        <Spin indicator={antIcon} size={size}>
          <div style={{ minHeight: '200px' }}>
            {tip && <div style={{ marginTop: 16, textAlign: 'center' }}>{tip}</div>}
          </div>
        </Spin>
      </div>
    )
  }

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      padding: '40px 0' 
    }}>
      <Spin indicator={antIcon} size={size}>
        <div style={{ minHeight: '100px' }}>
          {tip && <div style={{ marginTop: 16, textAlign: 'center' }}>{tip}</div>}
        </div>
      </Spin>
    </div>
  )
}

export default Loading

