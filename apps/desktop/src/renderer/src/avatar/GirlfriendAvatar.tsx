import { memo, useId } from 'react'
import {
  describeAvatar,
  eyeColorOf,
  hairColorOf,
  lipColorOf,
  outfitColorOf,
  skinToneOf,
  type AvatarConfig,
  type HairStyleId
} from './avatarConfig'

/**
 * 半写实 SVG 形象预览。
 *
 * 这是**可替换的渲染层**：编辑器只依赖 AvatarConfig，等接入生成式写实渲染
 * （本地 SD/ComfyUI 或商用数字人 API）后，用同参数生成图片替换本组件即可。
 * 当前用分层 SVG + 渐变模拟皮肤、头发与光影，避免引入外部图片和网络字体。
 */

interface GirlfriendAvatarProps {
  readonly config: AvatarConfig
  readonly variant?: 'portrait' | 'avatar'
  readonly size?: number
  readonly className?: string
  readonly name?: string
}

interface EyeProps {
  readonly cx: number
  readonly cy: number
  readonly rx: number
  readonly ry: number
  readonly iris: string
  readonly ring: string
  readonly clipId: string
  readonly mirror: boolean
}

function Eye({ cx, cy, rx, ry, iris, ring, clipId, mirror }: EyeProps) {
  const white = `M ${cx - rx} ${cy} C ${cx - rx * 0.5} ${cy - ry * 1.1} ${cx + rx * 0.5} ${cy - ry * 1.1} ${cx + rx} ${cy} C ${cx + rx * 0.5} ${cy + ry * 0.9} ${cx - rx * 0.5} ${cy + ry * 0.9} ${cx - rx} ${cy} Z`
  const outer = mirror ? -1 : 1

  return (
    <g>
      <defs>
        <radialGradient id={`${clipId}-iris`} cx="42%" cy="35%" r="72%">
          <stop offset="0" stopColor={iris} stopOpacity="0.7" />
          <stop offset="0.55" stopColor={iris} />
          <stop offset="1" stopColor={ring} />
        </radialGradient>
      </defs>
      <clipPath id={clipId}>
        <path d={white} />
      </clipPath>
      <path d={white} fill="#fdf8f6" />
      <g clipPath={`url(#${clipId})`}>
        <circle cx={cx} cy={cy} r={rx * 0.56} fill={`url(#${clipId}-iris)`} />
        <circle cx={cx} cy={cy} r={rx * 0.56} fill="none" stroke={ring} strokeWidth={1.4} opacity={0.7} />
        <circle cx={cx} cy={cy} r={rx * 0.24} fill="#1b1212" />
        <circle cx={cx - rx * 0.18} cy={cy - rx * 0.22} r={rx * 0.15} fill="#ffffff" opacity={0.92} />
        <circle cx={cx + rx * 0.2} cy={cy + rx * 0.2} r={rx * 0.07} fill="#ffffff" opacity={0.55} />
      </g>
      {/* 上眼线与眼尾睫毛 */}
      <path
        d={`M ${cx - rx} ${cy} C ${cx - rx * 0.5} ${cy - ry * 1.18} ${cx + rx * 0.5} ${cy - ry * 1.18} ${cx + rx} ${cy}`}
        fill="none"
        stroke="#2c1e1a"
        strokeWidth={2.1}
        strokeLinecap="round"
      />
      <path
        d={`M ${cx + outer * rx} ${cy} l ${outer * 4} ${-3}`}
        stroke="#2c1e1a"
        strokeWidth={1.7}
        strokeLinecap="round"
      />
      <path
        d={`M ${cx + outer * (rx - 2)} ${cy - 1} l ${outer * 3} ${-5}`}
        stroke="#2c1e1a"
        strokeWidth={1.4}
        strokeLinecap="round"
      />
      {/* 双眼皮褶 */}
      <path
        d={`M ${cx - rx * 0.8} ${cy - ry * 1.35} C ${cx - rx * 0.3} ${cy - ry * 1.75} ${cx + rx * 0.3} ${cy - ry * 1.75} ${cx + rx * 0.8} ${cy - ry * 1.35}`}
        fill="none"
        stroke={ring}
        strokeWidth={1}
        opacity={0.35}
      />
    </g>
  )
}

function backHair(style: HairStyleId): string {
  switch (style) {
    case 'long-straight':
      return 'M 160 86 C 108 86 82 122 82 180 C 82 236 74 310 66 370 L 118 370 C 122 300 126 240 126 196 L 194 196 C 194 240 198 300 202 370 L 254 370 C 246 310 238 236 238 180 C 238 122 212 86 160 86 Z'
    case 'long-wave':
      return 'M 160 86 C 110 86 82 122 82 178 C 82 218 72 250 74 292 C 76 330 68 352 62 372 L 116 372 C 120 332 124 300 126 262 L 194 262 C 196 300 200 332 204 372 L 258 372 C 252 352 244 330 246 292 C 248 250 238 218 238 178 C 238 122 210 86 160 86 Z'
    case 'bob':
      return 'M 160 86 C 112 86 86 122 86 180 C 86 216 90 252 98 284 C 108 300 128 308 160 308 C 192 308 212 300 222 284 C 230 252 234 216 234 180 C 234 122 208 86 160 86 Z'
    case 'twin-tails':
      return 'M 160 86 C 114 86 88 122 88 178 C 88 214 92 240 100 262 C 112 274 132 280 160 280 C 188 280 208 274 220 262 C 228 240 232 214 232 178 C 232 122 206 86 160 86 Z'
    case 'updo':
      return 'M 160 86 C 116 86 92 120 92 174 C 92 204 96 228 104 248 C 118 258 138 262 160 262 C 182 262 202 258 216 248 C 224 228 228 204 228 174 C 228 120 204 86 160 86 Z'
    case 'ponytail':
      return 'M 160 86 C 114 86 88 122 88 178 C 88 210 92 236 100 258 C 112 270 132 276 160 276 C 188 276 208 270 220 258 C 228 236 232 210 232 178 C 232 122 206 86 160 86 Z'
    case 'short':
      return 'M 160 88 C 118 88 94 120 94 170 C 94 198 98 220 106 238 C 120 248 138 252 160 252 C 182 252 200 248 214 238 C 222 220 226 198 226 170 C 226 120 202 88 160 88 Z'
  }
}

function frontHair(style: HairStyleId): string {
  switch (style) {
    case 'long-straight':
      return 'M 92 196 C 90 128 118 94 160 94 C 202 94 230 128 228 196 C 224 170 212 154 196 148 C 180 142 168 152 160 166 C 152 152 140 142 124 148 C 108 154 96 170 92 196 Z'
    case 'long-wave':
      return 'M 92 196 C 90 128 118 94 160 94 C 202 94 230 128 228 196 C 226 174 220 158 208 150 C 192 140 172 142 156 152 C 140 162 124 168 110 176 C 102 182 96 188 92 196 Z'
    case 'bob':
      return 'M 92 196 C 90 128 118 94 160 94 C 202 94 230 128 228 196 C 224 180 218 168 208 160 C 190 148 130 148 112 160 C 102 168 96 180 92 196 Z'
    case 'twin-tails':
      return 'M 92 196 C 90 128 118 94 160 94 C 202 94 230 128 228 196 C 226 172 218 156 206 148 C 190 138 170 142 154 152 C 138 162 122 168 108 176 C 100 182 96 188 92 196 Z'
    case 'updo':
      return 'M 92 196 C 90 128 118 94 160 94 C 202 94 230 128 228 196 C 226 172 216 156 202 148 C 184 138 166 144 152 156 C 140 166 124 172 110 180 C 102 186 96 190 92 196 Z'
    case 'ponytail':
      return 'M 92 196 C 90 128 118 94 160 94 C 202 94 230 128 228 196 C 226 174 218 158 206 150 C 190 140 170 144 154 154 C 138 164 122 170 108 178 C 100 184 96 190 92 196 Z'
    case 'short':
      return 'M 94 190 C 92 128 120 96 160 96 C 200 96 228 128 226 190 C 220 172 212 160 200 154 C 184 146 136 146 120 154 C 108 160 100 172 94 190 Z'
  }
}

const SIDE_LOCK =
  'M 101 176 C 92 216 93 258 102 292 C 107 308 116 318 124 318 C 114 282 114 232 119 196 Z'
const SIDE_LOCK_RIGHT =
  'M 219 176 C 228 216 227 258 218 292 C 213 308 204 318 196 318 C 206 282 206 232 201 196 Z'

const TWIN_TAIL =
  'M 98 188 C 66 204 50 246 56 298 C 60 330 76 354 98 360 C 88 322 88 270 96 230 Z'

const GLASSES_SHADOW = 'rgba(40, 30, 26, 0.16)'

/** 服饰风格只改轮廓细节，不引入外部图片；颜色仍由 outfitColor 控制。 */
function OutfitDetails({
  style,
  shade
}: {
  readonly style: AvatarConfig['outfitStyle']
  readonly shade: string
}) {
  switch (style) {
    case 'knit':
      return (
        <g stroke={shade} strokeWidth="2" fill="none" opacity="0.8">
          <path d="M 160 326 L 160 400" />
          <path d="M 154 338 h 12 M 154 352 h 12" strokeLinecap="round" />
          <path d="M 128 390 C 140 384 180 384 192 390" opacity="0.5" />
        </g>
      )
    case 'campus':
      return (
        <g>
          <path d="M 136 314 L 160 344 L 184 314" fill="none" stroke={shade} strokeWidth="2.4" opacity="0.8" />
          <path d="M 160 344 L 150 362 L 160 356 L 170 362 Z" fill="#c2636c" opacity="0.85" />
          <path d="M 116 360 h 88" stroke={shade} strokeWidth="1.6" opacity="0.35" />
        </g>
      )
    case 'commute':
      return (
        <g stroke={shade} strokeWidth="2.2" fill="none" opacity="0.85">
          <path d="M 136 314 L 160 348 L 184 314" />
          <path d="M 148 330 L 160 348 L 172 330" />
          <path d="M 160 348 L 160 400" opacity="0.45" />
        </g>
      )
    case 'home':
      return (
        <g stroke={shade} strokeWidth="2" fill="none" opacity="0.75">
          <path d="M 132 322 C 142 338 178 338 188 322" />
          <path d="M 150 344 L 146 360 M 170 344 L 174 360" strokeLinecap="round" />
          <path d="M 124 372 h 30" opacity="0.45" />
        </g>
      )
    case 'vintage':
      return (
        <g>
          <path d="M 136 314 L 136 338 L 184 338 L 184 314" fill="none" stroke={shade} strokeWidth="2.2" opacity="0.8" />
          <circle cx="160" cy="326" r="4" fill="#d8b06a" />
          <path d="M 148 354 h 24" stroke={shade} strokeWidth="1.5" opacity="0.4" />
        </g>
      )
    case 'sporty':
      return (
        <g stroke={shade} strokeWidth="2" fill="none" opacity="0.8">
          <path d="M 160 320 L 160 400" />
          <path d="M 156 326 h 8 M 156 336 h 8" strokeLinecap="round" />
          <path d="M 118 356 L 138 350 M 202 356 L 182 350" opacity="0.55" />
        </g>
      )
    default:
      return (
        <g stroke={shade} strokeWidth="1.8" fill="none" opacity="0.55">
          <path d="M 138 320 C 146 330 174 330 182 320" />
          <path d="M 118 362 C 132 356 144 366 160 366 C 176 366 188 356 202 362" opacity="0.4" />
        </g>
      )
  }
}

function GirlfriendAvatar({
  config,
  variant = 'portrait',
  size,
  className,
  name = '沈幼楚'
}: GirlfriendAvatarProps) {
  const rawId = useId()
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, '')
  const skin = skinToneOf(config.skinTone)
  const hair = hairColorOf(config.hairColor)
  const eye = eyeColorOf(config.eyeColor)
  const lip = lipColorOf(config.lipColor)
  const outfit = outfitColorOf(config.outfitColor)

  const cheek = 56 + 5 * (1 - config.faceShape)
  const jaw = 20 + 9 * (1 - config.faceShape)
  const eyeDx = 27 + 8 * config.eyeSpacing
  const eyeRx = 10 + 5 * config.eyeSize
  const eyeRy = 5.5 + 3.5 * config.eyeSize
  const lipW = 18 + 7 * config.lipFullness
  const lipH = 4 + 6 * config.lipFullness
  const eyeY = 206
  const browY = 181

  const facePath = [
    'M 160 110',
    `C ${160 + cheek + 14} 110, ${160 + cheek} 146, ${160 + cheek} 196`,
    `C ${160 + cheek} 240, ${160 + jaw + 8} 270, ${160 + jaw} 284`,
    `C ${160 + jaw - 8} 298, 170 302, 160 302`,
    `C 150 302, ${160 - jaw + 8} 298, ${160 - jaw} 284`,
    `C ${160 - jaw - 8} 270, ${160 - cheek} 240, ${160 - cheek} 196`,
    `C ${160 - cheek} 146, ${160 - cheek - 14} 110, 160 110`,
    'Z'
  ].join(' ')

  const browPath = (cx: number) => {
    switch (config.browStyle) {
      case 'soft':
        return `M ${cx - 15} ${browY + 2} Q ${cx} ${browY - 7} ${cx + 15} ${browY - 1}`
      case 'straight':
        return `M ${cx - 15} ${browY - 1} Q ${cx} ${browY - 5} ${cx + 15} ${browY - 1}`
      case 'arch':
        return `M ${cx - 15} ${browY + 3} Q ${cx} ${browY - 13} ${cx + 15} ${browY + 1}`
    }
  }

  const isLong = config.hairStyle === 'long-straight' || config.hairStyle === 'long-wave'
  const showLocks = isLong || config.hairStyle === 'twin-tails' || config.hairStyle === 'updo'

  return (
    <svg
      className={['avatar', `avatar--${variant}`, className].filter(Boolean).join(' ')}
      viewBox={variant === 'avatar' ? '65 82 190 190' : '0 0 320 400'}
      role="img"
      aria-label={`${name}的半写实形象：${describeAvatar(config)}`}
      preserveAspectRatio="xMidYMid slice"
      width={size === undefined ? undefined : size}
      height={size === undefined ? undefined : size}
    >
      <defs>
        <linearGradient id={`${uid}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fdf6ef" />
          <stop offset="0.55" stopColor="#f3e4d8" />
          <stop offset="1" stopColor="#e7d2c4" />
        </linearGradient>
        <radialGradient id={`${uid}-glow`} cx="50%" cy="42%" r="55%">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.75" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}-skin`} cx="45%" cy="36%" r="78%">
          <stop offset="0" stopColor={skin.highlight} />
          <stop offset="0.5" stopColor={skin.base} />
          <stop offset="1" stopColor={skin.shadow} />
        </radialGradient>
        <linearGradient id={`${uid}-hair`} x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stopColor={hair.highlight} />
          <stop offset="0.35" stopColor={hair.base} />
          <stop offset="1" stopColor={hair.shadow} />
        </linearGradient>
        <linearGradient id={`${uid}-outfit`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={outfit.base} />
          <stop offset="1" stopColor={outfit.shade} />
        </linearGradient>
        <filter id={`${uid}-blur`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <filter id={`${uid}-soft`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
      </defs>

      {/* 背景 */}
      <rect x="0" y="0" width="320" height="400" fill={`url(#${uid}-bg)`} />
      <rect x="0" y="0" width="320" height="400" fill={`url(#${uid}-glow)`} />
      <circle cx="68" cy="86" r="52" fill="#ffffff" opacity="0.18" />
      <circle cx="262" cy="330" r="72" fill={outfit.base} opacity="0.14" />

      {/* 身体与衣领 */}
      <path
        d="M 26 400 C 32 348 78 322 122 314 L 198 314 C 242 322 288 348 294 400 Z"
        fill={`url(#${uid}-outfit)`}
      />
      <path d="M 136 314 C 142 344 178 344 184 314 Z" fill={skin.base} />
      <path
        d="M 136 314 C 142 344 178 344 184 314"
        fill="none"
        stroke={outfit.shade}
        strokeWidth="2.5"
        opacity="0.8"
      />
      <path d="M 126 320 C 138 352 182 352 194 320" fill="none" stroke="#ffffff" strokeOpacity="0.28" strokeWidth="3" />
      <OutfitDetails style={config.outfitStyle} shade={outfit.shade} />

      {/* 颈与阴影 */}
      <path d="M 138 278 L 182 278 L 178 318 C 166 326 154 326 142 318 Z" fill={skin.base} />
      <ellipse cx="160" cy="286" rx="30" ry="12" fill={skin.shadow} opacity="0.45" filter={`url(#${uid}-blur)`} />

      {/* 后层头发 */}
      <path d={backHair(config.hairStyle)} fill={`url(#${uid}-hair)`} />
      {config.hairStyle === 'twin-tails' && (
        <>
          <path d={TWIN_TAIL} fill={`url(#${uid}-hair)`} />
          <path d={TWIN_TAIL} fill={`url(#${uid}-hair)`} transform="translate(320 0) scale(-1 1)" />
          <circle cx="99" cy="214" r="7" fill={lip.base} />
          <circle cx="221" cy="214" r="7" fill={lip.base} />
        </>
      )}
      {config.hairStyle === 'updo' && (
        <>
          <circle cx="160" cy="66" r="30" fill={`url(#${uid}-hair)`} />
          <circle cx="160" cy="66" r="19" fill={hair.shadow} opacity="0.45" />
          <ellipse cx="152" cy="58" rx="10" ry="6" fill={hair.highlight} opacity="0.5" transform="rotate(-24 152 58)" />
        </>
      )}
      {config.hairStyle === 'ponytail' && (
        <path
          d="M 218 132 C 252 154 262 202 252 254 C 248 278 238 296 226 306 C 238 266 238 216 226 174 Z"
          fill={`url(#${uid}-hair)`}
        />
      )}

      {/* 耳朵 */}
      <ellipse cx={160 - cheek - 3} cy="224" rx="10" ry="16" fill={skin.base} />
      <ellipse cx={160 + cheek + 3} cy="224" rx="10" ry="16" fill={skin.base} />

      {/* 脸 */}
      <path d={facePath} fill={`url(#${uid}-skin)`} />
      <ellipse cx={160 - cheek + 14} cy="228" rx="13" ry="30" fill={skin.shadow} opacity="0.16" filter={`url(#${uid}-blur)`} />
      <ellipse cx={160 + cheek - 14} cy="228" rx="13" ry="30" fill={skin.shadow} opacity="0.16" filter={`url(#${uid}-blur)`} />
      <ellipse cx="150" cy="156" rx="32" ry="20" fill={skin.highlight} opacity="0.4" filter={`url(#${uid}-blur)`} />

      {/* 眉毛 */}
      <path d={browPath(160 - eyeDx)} fill="none" stroke={hair.shadow} strokeWidth="3.4" strokeLinecap="round" opacity="0.85" />
      <path d={browPath(160 + eyeDx)} fill="none" stroke={hair.shadow} strokeWidth="3.4" strokeLinecap="round" opacity="0.85" />

      {/* 眼睛 */}
      <Eye
        cx={160 - eyeDx}
        cy={eyeY}
        rx={eyeRx}
        ry={eyeRy}
        iris={eye.iris}
        ring={eye.ring}
        clipId={`${uid}-eye-l`}
        mirror
      />
      <Eye
        cx={160 + eyeDx}
        cy={eyeY}
        rx={eyeRx}
        ry={eyeRy}
        iris={eye.iris}
        ring={eye.ring}
        clipId={`${uid}-eye-r`}
        mirror={false}
      />

      {/* 鼻子 */}
      <path d="M 160 226 C 156 236 153 242 158 245" fill="none" stroke={skin.shadow} strokeWidth="1.7" strokeLinecap="round" opacity="0.75" />
      <ellipse cx="155" cy="246" rx="2.6" ry="1.6" fill={skin.shadow} opacity="0.45" />
      <ellipse cx="165" cy="246" rx="2.6" ry="1.6" fill={skin.shadow} opacity="0.45" />

      {/* 腮红 */}
      <ellipse cx={160 - eyeDx - 4} cy="240" rx="19" ry="10" fill="#e8898b" opacity={0.08 + config.blush * 0.3} filter={`url(#${uid}-blur)`} />
      <ellipse cx={160 + eyeDx + 4} cy="240" rx="19" ry="10" fill="#e8898b" opacity={0.08 + config.blush * 0.3} filter={`url(#${uid}-blur)`} />

      {/* 嘴唇 */}
      <path
        d={`M ${160 - lipW} 262 C ${160 - lipW * 0.62} ${256 - lipH * 0.3} ${160 - lipW * 0.24} ${255 - lipH * 0.3} 160 ${259} C ${160 + lipW * 0.24} ${255 - lipH * 0.3} ${160 + lipW * 0.62} ${256 - lipH * 0.3} ${160 + lipW} 262 C ${160 + lipW * 0.5} ${264 + lipH * 0.9} ${160 - lipW * 0.5} ${264 + lipH * 0.9} ${160 - lipW} 262 Z`}
        fill={lip.base}
      />
      <path
        d={`M ${160 - lipW} 262 C ${160 - lipW * 0.5} ${264 + lipH * 0.9} ${160 + lipW * 0.5} ${264 + lipH * 0.9} ${160 + lipW} 262`}
        fill="none"
        stroke={lip.dark}
        strokeWidth="1.2"
        opacity="0.55"
      />
      <ellipse cx="160" cy={266 + lipH * 0.2} rx={lipW * 0.34} ry={lipH * 0.32} fill="#ffffff" opacity="0.3" />

      {/* 前层头发与侧发 */}
      <path
        d={frontHair(config.hairStyle)}
        fill={skin.shadow}
        opacity="0.16"
        filter={`url(#${uid}-blur)`}
        transform="translate(0 7)"
      />
      <path d={frontHair(config.hairStyle)} fill={`url(#${uid}-hair)`} />
      {showLocks && (
        <>
          <path d={SIDE_LOCK} fill={`url(#${uid}-hair)`} />
          <path d={SIDE_LOCK_RIGHT} fill={`url(#${uid}-hair)`} />
        </>
      )}
      <path d="M 118 112 C 130 100 148 95 166 96" fill="none" stroke={hair.highlight} strokeWidth="4" strokeLinecap="round" opacity="0.55" />
      <path d="M 196 124 C 206 136 212 152 214 168" fill="none" stroke={hair.highlight} strokeWidth="3" strokeLinecap="round" opacity="0.45" />

      {/* 配饰 */}
      {config.accessory === 'earrings' && (
        <>
          <circle cx={160 - cheek - 3} cy="244" r="4.2" fill="#d8b06a" />
          <circle cx={160 + cheek + 3} cy="244" r="4.2" fill="#d8b06a" />
          <path d={`M ${160 - cheek - 3} 236 L ${160 - cheek - 3} 240`} stroke="#d8b06a" strokeWidth="1.6" />
          <path d={`M ${160 + cheek + 3} 236 L ${160 + cheek + 3} 240`} stroke="#d8b06a" strokeWidth="1.6" />
        </>
      )}
      {config.accessory === 'hairpin' && (
        <g>
          <circle cx="206" cy="134" r="4" fill="#e8b7c4" />
          <circle cx="198" cy="139" r="3.2" fill="#f2cdd6" />
          <circle cx="212" cy="141" r="3" fill="#f2cdd6" />
          <path d="M 206 134 L 216 124" stroke="#d8b06a" strokeWidth="2.2" strokeLinecap="round" />
        </g>
      )}
      {config.accessory === 'glasses' && (
        <g>
          <rect
            x={160 - eyeDx - eyeRx - 5}
            y={eyeY - eyeRy - 6}
            width={eyeRx * 2 + 10}
            height={eyeRy * 2 + 12}
            rx="8"
            fill="#ffffff"
            fillOpacity="0.12"
            stroke="#5b4a42"
            strokeWidth="2"
          />
          <rect
            x={160 + eyeDx - eyeRx - 5}
            y={eyeY - eyeRy - 6}
            width={eyeRx * 2 + 10}
            height={eyeRy * 2 + 12}
            rx="8"
            fill="#ffffff"
            fillOpacity="0.12"
            stroke="#5b4a42"
            strokeWidth="2"
          />
          <path d={`M ${160 - eyeDx + eyeRx + 5} ${eyeY} L ${160 + eyeDx - eyeRx - 5} ${eyeY}`} stroke="#5b4a42" strokeWidth="2" />
          <path
            d={`M ${160 - eyeDx - eyeRx - 5} ${eyeY - 2} L ${160 - cheek - 2} ${eyeY - 6}`}
            stroke="#5b4a42"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d={`M ${160 + eyeDx + eyeRx + 5} ${eyeY - 2} L ${160 + cheek + 2} ${eyeY - 6}`}
            stroke="#5b4a42"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <rect
            x={160 - eyeDx - eyeRx - 5}
            y={eyeY - eyeRy - 6}
            width={eyeRx * 2 + 10}
            height={eyeRy * 2 + 12}
            rx="8"
            fill="none"
            stroke={GLASSES_SHADOW}
            strokeWidth="1"
          />
        </g>
      )}
    </svg>
  )
}

export default memo(GirlfriendAvatar)
