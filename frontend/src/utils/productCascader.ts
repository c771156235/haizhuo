/**
 * 产品级联：仅允许叶子节点作为表单值（中间层级仅用于展开导航）。
 */

export type ProductCascaderOption = {
  value?: string | number
  label?: unknown
  children?: ProductCascaderOption[]
}

export function isLeafProductPath(
  path: (string | number)[],
  options: ProductCascaderOption[]
): boolean {
  if (!path.length) return false
  let level: ProductCascaderOption[] | undefined = options
  let node: ProductCascaderOption | undefined
  for (const key of path) {
    if (!level?.length) return false
    node = level.find((o) => o.value === key)
    if (!node) return false
    level = node.children
  }
  const ch = node?.children
  return !ch || ch.length === 0
}

export function filterProductPathsToLeavesOnly(
  paths: (string | number)[][] | undefined,
  options: ProductCascaderOption[]
): (string | number)[][] {
  if (!paths?.length) return []
  return paths.filter((p) => isLeafProductPath(p, options))
}
