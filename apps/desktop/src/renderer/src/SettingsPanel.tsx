import type { UserView } from './api/client'
import LlmSettingsCard from './LlmSettingsCard'
import Icon from './ui/Icon'
import VoiceSettings from './voice/VoiceSettings'

interface SettingsPanelProps {
  readonly user: UserView
  readonly apiBase: string
  readonly error: string | null
  readonly onLogout: () => void
  readonly onDeleteAccount: () => void
  readonly onManageCharacters: () => void
}

/** 设置页：账户、角色、连接与危险操作。 */
export default function SettingsPanel({
  user,
  apiBase,
  error,
  onLogout,
  onDeleteAccount,
  onManageCharacters
}: SettingsPanelProps) {
  return (
    <section className="page" aria-label="设置">
      <header className="page__header">
        <div>
          <h1 className="page__title">设置</h1>
          <p className="page__subtitle">账户、角色与本机连接信息。</p>
        </div>
      </header>

      {error !== null && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      <div className="settings">
        <section className="setting-card">
          <h2 className="setting-card__title">账户</h2>
          <div className="setting-row">
            <span className="setting-row__label">用户名</span>
            <span className="setting-row__value">{user.username}</span>
          </div>
          <div className="setting-row">
            <span className="setting-row__label">角色</span>
            <span className="setting-row__value">{user.role}</span>
          </div>
          <button className="btn btn--ghost" type="button" onClick={onLogout}>
            <Icon name="logout" size={16} />
            退出登录
          </button>
        </section>

        <section className="setting-card">
          <h2 className="setting-card__title">角色</h2>
          <p className="setting-card__desc">
            自定义角色的定义随账号同步；官方角色的本机形象覆盖与所有立绘只保存在本机。
          </p>
          <button className="btn btn--ghost" type="button" onClick={onManageCharacters}>
            <Icon name="sparkles" size={16} />
            管理角色
          </button>
        </section>

        <section className="setting-card">
          <h2 className="setting-card__title">连接</h2>
          <div className="setting-row">
            <span className="setting-row__label">后端地址</span>
            <code className="setting-row__code">{apiBase}</code>
          </div>
          <p className="setting-card__desc">
            可用环境变量 <code>VITE_API_BASE_URL</code> 覆盖；修改后重启应用生效。
          </p>
        </section>

        <LlmSettingsCard />

        <VoiceSettings />

        <section className="setting-card setting-card--danger">
          <h2 className="setting-card__title">危险操作</h2>
          <p className="setting-card__desc">
            删除账号会清除你的会话、消息、记忆、关系状态与自定义角色，且无法恢复。
          </p>
          <button className="btn btn--danger" type="button" onClick={onDeleteAccount}>
            <Icon name="trash" size={16} />
            删除账号
          </button>
        </section>
      </div>
    </section>
  )
}
