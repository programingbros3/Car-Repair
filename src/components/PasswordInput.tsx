import { useState } from 'react'

type PasswordInputProps = {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoFocus?: boolean
  className?: string
  inputClassName?: string
  inputStyle?: React.CSSProperties
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  )
}

export default function PasswordInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  className,
  inputClassName,
  inputStyle,
  onKeyDown,
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false)
  const [capsLockOn, setCapsLockOn] = useState(false)

  return (
    <div className={`pwd-wrapper${className ? ` ${className}` : ''}`}>
      <div className="pwd-input-wrap">
        <input
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { setCapsLockOn(e.getModifierState('CapsLock')); onKeyDown?.(e) }}
          onKeyUp={e => setCapsLockOn(e.getModifierState('CapsLock'))}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className={`pwd-input${inputClassName ? ` ${inputClassName}` : ''}`}
          style={{ ...inputStyle, paddingLeft: '2.5rem' }}
        />
        <button
          type="button"
          className="pwd-toggle-btn"
          tabIndex={-1}
          onClick={() => setShowPassword(s => !s)}
          aria-label={showPassword ? 'إخفاء كلمة السر' : 'إظهار كلمة السر'}
        >
          {showPassword ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      {capsLockOn && (
        <span className="pwd-capslock-warning">⚠ مفتاح Caps Lock مفعّل</span>
      )}
    </div>
  )
}
