import { useEffect, useId, useRef, useState } from 'react'
import { DEFAULT_AVATAR } from '../avatar/avatarConfig'
import AvatarPortrait from '../portrait/AvatarPortrait'
import type { CharacterView } from './characterTypes'
import type { CharacterPreviewMap } from './useCharacterPreviews'
import { cx, displayNameOf } from './characterUiHelpers'

export interface CharacterSwitcherProps {
  readonly characters: readonly CharacterView[]
  readonly previews?: CharacterPreviewMap
  readonly activeId: string | null
  readonly onSelect: (id: string) => void
  readonly onManage: () => void
  readonly variant?: 'rail' | 'header' | 'sidebar'
  readonly align?: 'left' | 'right'
}

/**
 * 当前角色切换器：左侧栏用圆形头像，聊天/角色页用“当前：名字 ▾”。
 * 只列出未归档角色；点击外部或按 Esc 关闭。
 */
export default function CharacterSwitcher({
  characters,
  previews,
  activeId,
  onSelect,
  onManage,
  variant = 'header',
  align = 'left'
}: CharacterSwitcherProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const menuId = useId()

  const visible = characters.filter((character) => character.status === 'active')
  const active = visible.find((character) => character.id === activeId) ?? null
  const activeName = active === null ? '她' : displayNameOf(active.displayName)

  useEffect(() => {
    if (!open) {
      return
    }
    const handlePointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (rootRef.current !== null && target instanceof Node && !rootRef.current.contains(target)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }
    const activeItem = menuRef.current?.querySelector<HTMLButtonElement>(
      'button[aria-current="true"]'
    )
    const firstItem = menuRef.current?.querySelector<HTMLButtonElement>(
      '.switcher__item'
    )
    ;(activeItem ?? firstItem)?.focus()
  }, [open])

  const closeAndRun = (action: () => void): void => {
    setOpen(false)
    action()
  }

  return (
    <div
      ref={rootRef}
      className={cx(
        'switcher',
        `switcher--${variant}`,
        align === 'right' ? 'switcher--align-right' : 'switcher--align-left'
      )}
    >
      {variant === 'rail' ? (
        <button
          ref={triggerRef}
          type="button"
          className="switcher__rail"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-label={`切换女友，当前：${activeName}`}
          onClick={() => {
            setOpen((previous) => !previous)
          }}
        >
          <span className="switcher__rail-avatar">
            <AvatarPortrait
              config={active?.avatarConfig ?? DEFAULT_AVATAR}
              portraits={active ? previews?.[active.id] ?? null : null}
              variant="avatar"
              name={activeName}
            />
          </span>
          <span className="switcher__rail-label">女友</span>
        </button>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          className={cx('switcher__trigger', `switcher__trigger--${variant}`)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          onClick={() => {
            setOpen((previous) => !previous)
          }}
        >
          <span className="switcher__trigger-label">当前：{activeName}</span>
          <span className="switcher__caret" aria-hidden="true">
            ▾
          </span>
        </button>
      )}

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          className="switcher__menu"
          role="menu"
          aria-label="切换女友"
          onKeyDown={(event) => {
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
              return
            }
            event.preventDefault()
            const items = Array.from(
              menuRef.current?.querySelectorAll<HTMLButtonElement>('.switcher__item') ?? []
            )
            if (items.length === 0) {
              return
            }
            const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement)
            const delta = event.key === 'ArrowDown' ? 1 : -1
            const nextIndex =
              currentIndex < 0
                ? delta > 0
                  ? 0
                  : items.length - 1
                : (currentIndex + delta + items.length) % items.length
            items[nextIndex]?.focus()
          }}
        >
          <div className="switcher__menu-head">
            <span className="switcher__menu-title">切换女友</span>
            <span className="switcher__menu-count">{visible.length} 位</span>
          </div>

          <div className="switcher__list">
            {visible.length === 0 && (
              <p className="switcher__empty">还没有可切换的角色，先去角色页新建一位吧。</p>
            )}
            {visible.map((character) => {
              const isCurrent = character.id === activeId
              return (
                <button
                  key={character.id}
                  type="button"
                  role="menuitem"
                  className={cx('switcher__item', isCurrent && 'switcher__item--active')}
                  aria-current={isCurrent ? 'true' : undefined}
                  onClick={() => {
                    closeAndRun(() => {
                      onSelect(character.id)
                    })
                  }}
                >
                  <span className="switcher__item-avatar">
                    <AvatarPortrait
                      config={character.avatarConfig}
                      portraits={previews?.[character.id] ?? null}
                      variant="avatar"
                      name={displayNameOf(character.displayName)}
                    />
                  </span>
                  <span className="switcher__item-main">
                    <span className="switcher__item-name">
                      {displayNameOf(character.displayName)}
                    </span>
                    <span className="switcher__item-meta">
                      {character.isOfficial ? '官方 · 人设只读' : '我的角色'}
                    </span>
                  </span>
                  {character.isOfficial && (
                    <span className="switcher__badge">官方</span>
                  )}
                  {isCurrent && <span className="switcher__current">当前</span>}
                </button>
              )
            })}
          </div>

          <div className="switcher__footer">
            <button
              type="button"
              role="menuitem"
              className="switcher__manage"
              onClick={() => {
                closeAndRun(onManage)
              }}
            >
              管理角色
              <span className="switcher__arrow" aria-hidden="true">
                →
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
