import type { VoiceFieldSchema } from '../api/client'

/**
 * 配置驱动字段渲染器：只支持后端 descriptor 声明的受控类型，
 * 不执行配置里的任何表达式/脚本（见 docs/17-modular-voice-architecture.md §2.3）。
 */
interface DynamicFieldProps {
  readonly field: VoiceFieldSchema
  readonly value: string
  readonly error: string | null
  readonly disabled: boolean
  /** secret 字段留空表示保留已保存值。 */
  readonly keepExistingHint: boolean
  readonly onChange: (key: string, value: string) => void
}

const FIELD_CLASS = 'creator__input'

export default function DynamicField({
  field,
  value,
  error,
  disabled,
  keepExistingHint,
  onChange
}: DynamicFieldProps) {
  const id = `vf-${field.key}`
  const placeholder = keepExistingHint && field.secret ? '留空表示保留已保存的值' : field.placeholder ?? ''
  const describedBy = error !== null ? `${id}-error` : field.help !== null ? `${id}-help` : undefined

  return (
    <label className="gen__field vf__field" htmlFor={id}>
      <span>
        {field.label}
        {field.required ? <span className="vf__required"> *</span> : null}
      </span>
      {renderControl()}
      {field.help !== null && field.help !== '' ? (
        <span className="gen__hint" id={`${id}-help`}>
          {field.help}
        </span>
      ) : null}
      {error !== null ? (
        <span className="vf__error" id={`${id}-error`} role="alert">
          {error}
        </span>
      ) : null}
    </label>
  )

  function renderControl() {
    const common = {
      id,
      disabled,
      'aria-invalid': error !== null,
      'aria-describedby': describedBy
    }

    if (field.type === 'SELECT') {
      return (
        <select
          className="select"
          value={value}
          onChange={(event) => {
            onChange(field.key, event.target.value)
          }}
          {...common}
        >
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )
    }

    if (field.type === 'TEXTAREA') {
      return (
        <textarea
          className="gen__textarea"
          value={value}
          rows={2}
          maxLength={field.maxLength ?? undefined}
          placeholder={placeholder}
          onChange={(event) => {
            onChange(field.key, event.target.value)
          }}
          {...common}
        />
      )
    }

    if (field.type === 'SWITCH') {
      return (
        <select
          className="select"
          value={value === 'true' ? 'true' : 'false'}
          onChange={(event) => {
            onChange(field.key, event.target.value)
          }}
          {...common}
        >
          <option value="true">开启</option>
          <option value="false">关闭</option>
        </select>
      )
    }

    const inputType =
      field.type === 'PASSWORD' ? 'password' : field.type === 'NUMBER' ? 'number' : 'text'

    return (
      <input
        className={FIELD_CLASS}
        type={inputType}
        value={value}
        maxLength={field.type === 'NUMBER' ? undefined : field.maxLength ?? undefined}
        placeholder={placeholder}
        autoComplete={field.type === 'PASSWORD' ? 'new-password' : 'off'}
        onChange={(event) => {
          onChange(field.key, event.target.value)
        }}
        {...common}
      />
    )
  }
}
