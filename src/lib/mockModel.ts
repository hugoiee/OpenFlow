/**
 * 模拟模型调用。这是后续接真实模型 API 的预留接口点——
 * 之后只需把这里换成真正的请求（前端直连或后端代理）即可。
 */
export async function runMockModel(model: string, prompt: string): Promise<string> {
  // 模拟网络延迟
  await new Promise((resolve) => setTimeout(resolve, 800))

  const trimmed = prompt.trim()
  if (!trimmed) {
    return `[${model}] 没有收到输入 prompt。请连接一个 Prompt 节点或在上游提供内容。`
  }
  return `[${model}] 模拟回复：已收到 ${trimmed.length} 个字符的 prompt。\n\n（这是占位结果，接入真实模型后会替换为实际输出。）`
}
