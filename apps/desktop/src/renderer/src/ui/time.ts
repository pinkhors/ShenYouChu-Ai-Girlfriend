/**
 * 时间展示工具：列表用微信式短格式（今天显示时刻、昨天、日期），详情用完整时间。
 * 无法解析的时间一律给占位文案，不出现 Invalid Date。
 */

const FULL_FORMATTER = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' })
const CLOCK_FORMATTER = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' })
const MONTH_DAY_FORMATTER = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' })

function parse(value: string | null): Date | null {
  if (value === null || value === '') {
    return null
  }
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

export function formatTime(value: string | null): string {
  const date = parse(value)
  return date === null ? '时间未知' : FULL_FORMATTER.format(date)
}

export function formatClock(value: string | null): string {
  const date = parse(value)
  return date === null ? '' : CLOCK_FORMATTER.format(date)
}

/** 会话列表右侧时间：今天 → HH:mm；昨天 → 昨天；今年 → M/D；更早 → 完整日期。 */
export function formatListTime(value: string | null): string {
  const date = parse(value)
  if (date === null) {
    return ''
  }
  const now = new Date()
  const dayDiff = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000)
  if (dayDiff <= 0) {
    return CLOCK_FORMATTER.format(date)
  }
  if (dayDiff === 1) {
    return '昨天'
  }
  if (date.getFullYear() === now.getFullYear()) {
    return MONTH_DAY_FORMATTER.format(date)
  }
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
}
