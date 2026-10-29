/**
 * 角色界面共用的小工具：只做展示层拼装，不包含业务状态。
 * 统一放在这里，避免五个面板各写一份。
 */

export function cx(...parts: readonly (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

/** 连续值（0–1）只映射为三档文字，界面上不出现 0–100 的数字。 */
export function tierIndex(value: number): 0 | 1 | 2 {
  if (!Number.isFinite(value) || value < 1 / 3) {
    return 0
  }
  return value > 2 / 3 ? 2 : 1
}

export function tierLabel(labels: readonly [string, string, string], value: number): string {
  return labels[tierIndex(value)]
}

export function errorOf(
  errors: Readonly<Record<string, string>>,
  key: string
): string | undefined {
  return errors[key]
}

/** 草稿没有名字时，预览里用“她”兜底，避免出现空白头像标题。 */
export function displayNameOf(value: string): string {
  const trimmed = value.trim()
  return trimmed === '' ? '她' : trimmed
}

export function characterTags(tags: readonly string[], fallback: readonly string[]): string[] {
  const source = tags.length > 0 ? tags : fallback
  return source.slice(0, 2)
}
