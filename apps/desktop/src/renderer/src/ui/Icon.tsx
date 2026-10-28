import type { ReactNode } from 'react'

/**
 * 内联 SVG 图标集：不引入图标库，避免额外依赖与字体加载。
 * 全部使用 currentColor，跟随按钮/导航的前景色。
 */

export type IconName =
  | 'chat'
  | 'sparkles'
  | 'book'
  | 'pulse'
  | 'settings'
  | 'search'
  | 'plus'
  | 'send'
  | 'mic'
  | 'stop'
  | 'trash'
  | 'logout'
  | 'user'
  | 'close'
  | 'check'
  | 'refresh'
  | 'phone'
  | 'video'
  | 'camera'

const PATHS: Record<IconName, ReactNode> = {
  chat: (
    <path d="M4 5.5h16v10.2H9.2L5.4 19v-3.3H4z" strokeLinejoin="round" />
  ),
  sparkles: (
    <>
      <path d="M12 3.5l1.7 4.3 4.3 1.7-4.3 1.7L12 15.5l-1.7-4.3L6 9.5l4.3-1.7z" strokeLinejoin="round" />
      <path d="M18.5 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" strokeLinejoin="round" />
    </>
  ),
  book: (
    <>
      <path d="M5 4.5h6a3 3 0 013 3V20a3 3 0 00-3-3H5z" strokeLinejoin="round" />
      <path d="M19 4.5h-6a3 3 0 00-3 3V20a3 3 0 013-3h6z" strokeLinejoin="round" />
    </>
  ),
  pulse: <path d="M3 12h4l2.5-6 4 12L16 12h5" strokeLinecap="round" strokeLinejoin="round" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3.5v2.2M12 18.3v2.2M4.6 7.5l1.9 1.1M17.5 15.4l1.9 1.1M4.6 16.5l1.9-1.1M17.5 8.6l1.9-1.1" strokeLinecap="round" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="5.5" />
      <path d="M15 15l4.5 4.5" strokeLinecap="round" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" strokeLinecap="round" />,
  send: <path d="M4 11.5L20 4l-7.5 16-2.2-6.3z" strokeLinejoin="round" />,
  mic: (
    <>
      <rect x="9" y="3.5" width="6" height="10.5" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0013 0M12 18v2.5" strokeLinecap="round" />
    </>
  ),
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="2" />,
  trash: (
    <>
      <path d="M4.5 6.5h15M9 6.5V4.5h6v2M6.5 6.5l1 13h9l1-13" strokeLinejoin="round" strokeLinecap="round" />
    </>
  ),
  logout: (
    <>
      <path d="M14 4.5H6.5v15H14" strokeLinejoin="round" />
      <path d="M10.5 12H20M17 8.8l3.2 3.2-3.2 3.2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.8 20c.8-3.6 3.7-5.6 7.2-5.6s6.4 2 7.2 5.6" strokeLinecap="round" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />,
  check: <path d="M5 12.5l4.5 4.5L19 7" strokeLinecap="round" strokeLinejoin="round" />,
  refresh: (
    <>
      <path d="M19.5 12a7.5 7.5 0 11-2.2-5.3" strokeLinecap="round" />
      <path d="M19.5 4.5V9H15" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  phone: (
    <path d="M6.5 4.5h3l1.3 4-2 1.4a11 11 0 005.3 5.3l1.4-2 4 1.3v3a2 2 0 01-2.2 2C10.6 18.9 5.1 13.4 4.5 6.7a2 2 0 012-2.2z" strokeLinejoin="round" />
  ),
  video: (
    <>
      <rect x="3.5" y="6" width="12" height="12" rx="2.5" />
      <path d="M15.5 10.5l5-3v9l-5-3z" strokeLinejoin="round" />
    </>
  ),
  camera: (
    <>
      <rect x="3.5" y="6.5" width="12.5" height="11" rx="2.5" />
      <circle cx="9.8" cy="12" r="3" />
      <path d="M16 10.5l4.5-2.5v8L16 13.5z" strokeLinejoin="round" />
    </>
  )
}

interface IconProps {
  readonly name: IconName
  readonly size?: number
  readonly className?: string
}

export default function Icon({ name, size = 20, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}
