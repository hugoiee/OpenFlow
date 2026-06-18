/** 生成简短唯一 id，用于项目 / 节点 / 连线。 */
export function newId(prefix = ''): string {
  const rand = Math.random().toString(36).slice(2, 8)
  const time = Date.now().toString(36)
  return `${prefix}${time}${rand}`
}
