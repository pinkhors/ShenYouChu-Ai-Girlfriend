/** 编码工具（纯函数，便于单元测试）。 */

/** UTF-8 文本转 Base64；M2 占位语音链路用它替代真实音频字节。 */
export function textToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

/** Base64 转 UTF-8 文本（与 textToBase64 互逆，供测试与调试使用）。 */
export function base64ToText(encoded: string): string {
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new TextDecoder().decode(bytes)
}