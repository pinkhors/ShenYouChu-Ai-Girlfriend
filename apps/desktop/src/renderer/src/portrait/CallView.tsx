import { useEffect, useRef, useState } from 'react'
import type { CharacterState } from '../api/client'
import type { AvatarConfig } from '../avatar/avatarConfig'
import GirlfriendAvatar from '../avatar/GirlfriendAvatar'
import Icon from '../ui/Icon'
import {
  PORTRAIT_SLOTS,
  moodToExpression,
  resolvePortrait,
  type PortraitExpression,
  type PortraitSet
} from './expression'

interface CallViewProps {
  readonly portraits: PortraitSet | null
  readonly config: AvatarConfig
  readonly characterState: CharacterState | null
  readonly onClose: () => void
}

function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function moodLine(state: CharacterState | null): string {
  if (state === null) {
    return '她在听你说。'
  }
  if (state.mood >= 70) {
    return '她看起来心情不错，正笑着看你。'
  }
  if (state.mood <= 30) {
    return '她今天有点安静，靠得更近了一点。'
  }
  return '她在听你说。'
}

/**
 * 通话页：立绘 + 表情差分 + 自动眨眼 + 呼吸感。
 * 语音链路仍是 M2 占位，这一版先验证“形象在通话中的表现”。
 */
export default function CallView({ portraits, config, characterState, onClose }: CallViewProps) {
  const [expression, setExpression] = useState<PortraitExpression>(() =>
    moodToExpression(characterState?.mood ?? null)
  )
  const [blinking, setBlinking] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [muted, setMuted] = useState(false)
  const talkTimer = useRef<number | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSeconds((previous) => previous + 1)
    }, 1000)
    return () => {
      window.clearInterval(timer)
    }
  }, [])

  /* 有闭眼图就自动眨眼，避免通话画面像一张死图 */
  useEffect(() => {
    if (portraits?.closed === undefined) {
      return
    }
    let openTimer = 0
    let closeTimer = 0
    const schedule = (): void => {
      openTimer = window.setTimeout(() => {
        setBlinking(true)
        closeTimer = window.setTimeout(() => {
          setBlinking(false)
          schedule()
        }, 160)
      }, 3200 + Math.random() * 3200)
    }
    schedule()
    return () => {
      window.clearTimeout(openTimer)
      window.clearTimeout(closeTimer)
    }
  }, [portraits])

  useEffect(() => {
    return () => {
      if (talkTimer.current !== null) {
        window.clearTimeout(talkTimer.current)
      }
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  const displayExpression: PortraitExpression =
    blinking && portraits?.closed !== undefined ? 'closed' : expression
  const source = resolvePortrait(portraits, displayExpression)

  const handleTalk = (): void => {
    if (portraits?.talking === undefined) {
      return
    }
    setExpression('talking')
    if (talkTimer.current !== null) {
      window.clearTimeout(talkTimer.current)
    }
    talkTimer.current = window.setTimeout(() => {
      setExpression(moodToExpression(characterState?.mood ?? null))
    }, 2600)
  }

  return (
    <div className="call" role="dialog" aria-modal="true" aria-label="与沈幼楚通话">
      {source !== null && (
        <div className="call__bg" style={{ backgroundImage: `url(${source})` }} aria-hidden="true" />
      )}

      <header className="call__header">
        <div>
          <p className="call__eyebrow">语音通话</p>
          <h2 className="call__name">沈幼楚</h2>
          <p className="call__timer">通话中 {formatDuration(seconds)}</p>
        </div>
        <button className="call__close" type="button" aria-label="关闭通话" onClick={onClose}>
          <Icon name="close" size={20} />
        </button>
      </header>

      <div className="call__stage">
        <div className="call__portrait">
          {source !== null ? (
            <img src={source} alt="沈幼楚" draggable={false} />
          ) : (
            <GirlfriendAvatar config={config} />
          )}
        </div>
        <p className="call__line">{moodLine(characterState)}</p>
      </div>

      <div className="call__expressions" role="group" aria-label="切换表情">
        {PORTRAIT_SLOTS.filter((slot) => slot.id !== 'closed').map((slot) => {
          const available = portraits?.[slot.id] !== undefined
          return (
            <button
              key={slot.id}
              className={expression === slot.id ? 'call__chip call__chip--active' : 'call__chip'}
              type="button"
              disabled={!available}
              onClick={() => {
                setExpression(slot.id)
              }}
            >
              {slot.label}
            </button>
          )
        })}
      </div>

      <footer className="call__controls">
        <button
          className={muted ? 'call__control call__control--active' : 'call__control'}
          type="button"
          onClick={() => {
            setMuted((previous) => !previous)
          }}
        >
          <Icon name="mic" size={20} />
          <span>{muted ? '取消静音' : '静音'}</span>
        </button>
        <button
          className="call__control call__control--talk"
          type="button"
          disabled={portraits?.talking === undefined}
          onClick={handleTalk}
        >
          <Icon name="sparkles" size={20} />
          <span>说话</span>
        </button>
        <button className="call__control call__control--hangup" type="button" onClick={onClose}>
          <Icon name="phone" size={20} />
          <span>挂断</span>
        </button>
      </footer>

      <p className="call__hint">语音链路仍是占位：当前演示立绘、表情切换与眨眼。</p>
    </div>
  )
}
