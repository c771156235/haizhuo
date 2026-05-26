/**
 * 列表 → 详情/新建/编辑 路径导航（与 react-router 联动）
 */
import type { ReactNode } from 'react'
import { Breadcrumb } from 'antd'
import { Link } from 'react-router-dom'

export type PageBreadcrumbItem = {
  title: ReactNode
  /** 非末级时可传，渲染为可点击链接 */
  to?: string
}

type PageBreadcrumbProps = {
  items: PageBreadcrumbItem[]
  style?: React.CSSProperties
}

export function PageBreadcrumb({ items, style }: PageBreadcrumbProps) {
  return (
    <Breadcrumb
      style={{ marginBottom: 16, ...style }}
      items={items.map((item, index) => ({
        key: index,
        title:
          item.to != null && item.to !== '' ? (
            <Link to={item.to}>{item.title}</Link>
          ) : (
            item.title
          ),
      }))}
    />
  )
}
