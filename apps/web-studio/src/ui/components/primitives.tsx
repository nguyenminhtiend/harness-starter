import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

/* ── Spinner ── */

interface SpinnerProps {
  size?: number;
}

export function Spinner({ size = 14 }: SpinnerProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      style={{ animation: 'spin 0.7s linear infinite', display: 'block' }}
    >
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.25" />
      <path
        d="M7 1.5A5.5 5.5 0 0 1 12.5 7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ── Button ── */

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg' | 'xl';

interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  children?: ReactNode;
  onClick?: () => void;
  style?: CSSProperties;
}

const buttonSizes: Record<ButtonSize, CSSProperties> = {
  sm: { fontSize: 'var(--text-sm)', padding: '3px 10px', height: 26 },
  md: { fontSize: 'var(--text-base)', padding: '5px 13px', height: 30 },
  lg: { fontSize: 'var(--text-md)', padding: '8px 18px', height: 36 },
  xl: { fontSize: 'var(--text-lg)', padding: '10px 22px', height: 42 },
};

const buttonVariants: Record<ButtonVariant, CSSProperties> = {
  primary: { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' },
  secondary: {
    background: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    borderColor: 'var(--border-default)',
  },
  danger: {
    background: 'var(--status-error-subtle)',
    color: 'var(--status-error)',
    borderColor: 'oklch(64% 0.18 25 / 0.3)',
  },
  ghost: { background: 'transparent', color: 'var(--text-secondary)', borderColor: 'transparent' },
  success: {
    background: 'var(--status-success-subtle)',
    color: 'var(--status-success)',
    borderColor: 'oklch(70% 0.15 148 / 0.3)',
  },
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  children,
  onClick,
  style,
}: ButtonProps) {
  const base: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 'var(--s2)',
    fontFamily: 'var(--font-sans)',
    fontWeight: 'var(--weight-medium)',
    borderRadius: 'var(--r-sm)',
    border: '1px solid transparent',
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    transition:
      'background var(--t-fast), color var(--t-fast), border-color var(--t-fast), opacity var(--t-fast)',
    whiteSpace: 'nowrap',
    userSelect: 'none',
    ...buttonSizes[size],
  };

  return (
    <button
      type="button"
      onClick={!disabled && !loading ? onClick : undefined}
      style={{ ...base, ...buttonVariants[variant], ...style }}
    >
      {loading && <Spinner size={12} />}
      {children}
    </button>
  );
}

/* ── Badge ── */

type BadgeVariant =
  | 'default'
  | 'accent'
  | 'running'
  | 'success'
  | 'error'
  | 'cancelled'
  | 'planner'
  | 'researcher'
  | 'writer'
  | 'factchecker';

interface BadgeProps {
  variant?: BadgeVariant;
  children?: ReactNode;
  style?: CSSProperties;
}

const badgeVariants: Record<BadgeVariant, CSSProperties> = {
  default: {
    background: 'var(--bg-overlay)',
    color: 'var(--text-secondary)',
    border: '1px solid var(--border-subtle)',
  },
  accent: {
    background: 'var(--accent-subtle)',
    color: 'var(--accent)',
    border: '1px solid var(--accent-border)',
  },
  running: {
    background: 'var(--status-running-subtle)',
    color: 'var(--status-running)',
    border: '1px solid oklch(75% 0.15 55 / 0.3)',
  },
  success: {
    background: 'var(--status-success-subtle)',
    color: 'var(--status-success)',
    border: '1px solid oklch(70% 0.15 148 / 0.3)',
  },
  error: {
    background: 'var(--status-error-subtle)',
    color: 'var(--status-error)',
    border: '1px solid oklch(64% 0.18 25 / 0.3)',
  },
  cancelled: {
    background: 'var(--bg-overlay)',
    color: 'var(--status-cancelled)',
    border: '1px solid var(--border-subtle)',
  },
  planner: {
    background: 'var(--phase-planner-subtle)',
    color: 'var(--phase-planner)',
    border: '1px solid var(--phase-planner-border)',
  },
  researcher: {
    background: 'var(--phase-researcher-subtle)',
    color: 'var(--phase-researcher)',
    border: '1px solid var(--phase-researcher-border)',
  },
  writer: {
    background: 'var(--phase-writer-subtle)',
    color: 'var(--phase-writer)',
    border: '1px solid var(--phase-writer-border)',
  },
  factchecker: {
    background: 'var(--phase-factchecker-subtle)',
    color: 'var(--phase-factchecker)',
    border: '1px solid var(--phase-factchecker-border)',
  },
};

export function Badge({ variant = 'default', children, style }: BadgeProps) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 'var(--text-xs)',
        fontWeight: 'var(--weight-medium)',
        fontFamily: 'var(--font-sans)',
        lineHeight: 1,
        padding: '2px 7px',
        borderRadius: 'var(--r-full)',
        letterSpacing: 'var(--tracking-wide)',
        textTransform: 'uppercase',
        ...badgeVariants[variant],
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/* ── Input ── */

interface InputProps {
  label?: string;
  hint?: string;
  error?: string;
  inherited?: boolean;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function Input({
  label,
  hint,
  error,
  inherited,
  value,
  onChange,
  type = 'text',
  placeholder,
  disabled,
}: InputProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s1)' }}>
      {label && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--s2)',
            justifyContent: 'space-between',
          }}
        >
          <span
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 'var(--weight-medium)',
              color: error ? 'var(--status-error)' : 'var(--text-secondary)',
              letterSpacing: 'var(--tracking-wide)',
              textTransform: 'uppercase',
            }}
          >
            {label}
          </span>
          {inherited && (
            <span
              style={{
                fontSize: 'var(--text-2xs)',
                color: 'var(--text-tertiary)',
                fontStyle: 'italic',
              }}
            >
              inherited
            </span>
          )}
        </div>
      )}
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          width: '100%',
          background: 'var(--bg-elevated)',
          border: `1px solid ${error ? 'var(--status-error)' : inherited ? 'var(--border-subtle)' : 'var(--border-default)'}`,
          borderRadius: 'var(--r-sm)',
          padding: '5px 9px',
          color: disabled
            ? 'var(--text-disabled)'
            : inherited
              ? 'var(--text-tertiary)'
              : 'var(--text-primary)',
          fontFamily: type === 'password' ? 'var(--font-mono)' : 'var(--font-sans)',
          fontSize: 'var(--text-sm)',
          outline: 'none',
          transition: 'border-color var(--t-fast)',
          opacity: disabled ? 0.6 : 1,
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = error ? 'var(--status-error)' : 'var(--accent)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = error
            ? 'var(--status-error)'
            : inherited
              ? 'var(--border-subtle)'
              : 'var(--border-default)';
        }}
      />
      {(hint || error) && (
        <span
          style={{
            fontSize: 'var(--text-xs)',
            color: error ? 'var(--status-error)' : 'var(--text-tertiary)',
          }}
        >
          {error || hint}
        </span>
      )}
    </div>
  );
}

/* ── Textarea ── */

interface TextareaProps {
  label?: string;
  hint?: string;
  error?: string;
  inherited?: boolean;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  onResetDefault?: () => void;
}

export function Textarea({
  label,
  hint,
  error,
  inherited,
  value,
  onChange,
  placeholder,
  rows = 4,
  disabled,
  onResetDefault,
}: TextareaProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s1)' }}>
      {label && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--s2)',
            justifyContent: 'space-between',
          }}
        >
          <span
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 'var(--weight-medium)',
              color: 'var(--text-secondary)',
              letterSpacing: 'var(--tracking-wide)',
              textTransform: 'uppercase',
            }}
          >
            {label}
            {inherited && (
              <span
                style={{
                  marginLeft: 6,
                  fontWeight: 400,
                  color: 'var(--text-tertiary)',
                  fontStyle: 'italic',
                  textTransform: 'none',
                }}
              >
                inherited
              </span>
            )}
          </span>
          {onResetDefault && (
            <button
              type="button"
              onClick={onResetDefault}
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--text-tertiary)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Restore default
            </button>
          )}
        </div>
      )}
      <textarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        style={{
          width: '100%',
          background: 'var(--bg-elevated)',
          border: `1px solid ${error ? 'var(--status-error)' : 'var(--border-default)'}`,
          borderRadius: 'var(--r-sm)',
          padding: '7px 9px',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-mono)',
          fontSize: 'var(--text-xs)',
          outline: 'none',
          resize: 'vertical',
          lineHeight: 'var(--leading-loose)',
          transition: 'border-color var(--t-fast)',
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'var(--accent)';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = error
            ? 'var(--status-error)'
            : 'var(--border-default)';
        }}
      />
      {(hint || error) && (
        <span
          style={{
            fontSize: 'var(--text-xs)',
            color: error ? 'var(--status-error)' : 'var(--text-tertiary)',
          }}
        >
          {error || hint}
        </span>
      )}
    </div>
  );
}

/* ── SelectField ── */

interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps {
  label?: string;
  hint?: string;
  inherited?: boolean;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options?: SelectOption[];
  disabled?: boolean;
}

export function SelectField({
  label,
  hint,
  inherited,
  value,
  onChange,
  options = [],
  disabled,
}: SelectFieldProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s1)' }}>
      {label && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 'var(--weight-medium)',
              color: 'var(--text-secondary)',
              letterSpacing: 'var(--tracking-wide)',
              textTransform: 'uppercase',
            }}
          >
            {label}
            {inherited && (
              <span
                style={{
                  marginLeft: 6,
                  fontWeight: 400,
                  color: 'var(--text-tertiary)',
                  fontStyle: 'italic',
                  textTransform: 'none',
                }}
              >
                inherited
              </span>
            )}
          </span>
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <select
          value={value}
          onChange={onChange}
          disabled={disabled}
          style={{
            width: '100%',
            appearance: 'none',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--r-sm)',
            padding: '5px 28px 5px 9px',
            color: inherited ? 'var(--text-tertiary)' : 'var(--text-primary)',
            fontSize: 'var(--text-sm)',
            fontFamily: 'var(--font-sans)',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <svg
          aria-hidden="true"
          style={{
            position: 'absolute',
            right: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
          }}
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
        >
          <path
            d="M3 4.5L6 7.5L9 4.5"
            stroke="var(--text-tertiary)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      {hint && (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>{hint}</span>
      )}
    </div>
  );
}

/* ── Toggle ── */

interface ToggleProps {
  label?: string;
  checked?: boolean;
  onChange?: (value: boolean) => void;
  hint?: string;
  size?: 'sm' | 'md';
}

export function Toggle({ label, checked, onChange, hint, size = 'md' }: ToggleProps) {
  const w = size === 'sm' ? 28 : 36;
  const h = size === 'sm' ? 16 : 20;
  const r = size === 'sm' ? 12 : 16;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 'var(--s3)',
      }}
    >
      {label && (
        <div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)' }}>{label}</div>
          {hint && (
            <div
              style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 1 }}
            >
              {hint}
            </div>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => onChange?.(!checked)}
        style={{
          width: w,
          height: h,
          borderRadius: h / 2,
          background: checked ? 'var(--accent)' : 'var(--bg-overlay)',
          border: `1px solid ${checked ? 'var(--accent)' : 'var(--border-default)'}`,
          cursor: 'pointer',
          padding: 2,
          display: 'flex',
          alignItems: 'center',
          justifyContent: checked ? 'flex-end' : 'flex-start',
          transition: 'background var(--t-base), border-color var(--t-base)',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            width: r,
            height: r,
            borderRadius: '50%',
            background: '#fff',
            boxShadow: 'var(--shadow-sm)',
            display: 'block',
            transition: 'transform var(--t-base)',
          }}
        />
      </button>
    </div>
  );
}

/* ── Slider ── */

interface SliderProps {
  label?: string;
  value: number;
  onChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
  formatValue?: (value: number) => string;
}

export function Slider({
  label,
  value,
  onChange,
  min = 1,
  max = 10,
  step = 1,
  hint,
  formatValue,
}: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {label && (
          <span
            style={{
              fontSize: 'var(--text-xs)',
              fontWeight: 'var(--weight-medium)',
              color: 'var(--text-secondary)',
              letterSpacing: 'var(--tracking-wide)',
              textTransform: 'uppercase',
            }}
          >
            {label}
          </span>
        )}
        <span
          style={{
            fontSize: 'var(--text-xs)',
            fontFamily: 'var(--font-mono)',
            color: 'var(--text-primary)',
            background: 'var(--bg-overlay)',
            padding: '1px 6px',
            borderRadius: 'var(--r-xs)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          {formatValue ? formatValue(value) : value}
        </span>
      </div>
      <div style={{ position: 'relative', height: 20, display: 'flex', alignItems: 'center' }}>
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: 3,
            background: 'var(--bg-overlay)',
            borderRadius: 'var(--r-full)',
            border: '1px solid var(--border-subtle)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 0,
            height: 3,
            background: 'var(--accent)',
            borderRadius: 'var(--r-full)',
            width: `${pct}%`,
          }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange?.(Number(e.currentTarget.value))}
          style={{
            position: 'relative',
            width: '100%',
            height: 20,
            appearance: 'none',
            background: 'transparent',
            cursor: 'pointer',
            zIndex: 1,
          }}
        />
      </div>
      {hint && (
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>{hint}</span>
      )}
    </div>
  );
}

/* ── Collapsible ── */

interface CollapsibleProps {
  title: string;
  children?: ReactNode;
  defaultOpen?: boolean;
  badge?: ReactNode;
}

export function Collapsible({ title, children, defaultOpen = false, badge }: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      style={{
        borderRadius: 'var(--r-md)',
        border: '1px solid var(--border-subtle)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--s2)',
          padding: 'var(--s2) var(--s3)',
          background: 'var(--bg-surface)',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-secondary)',
          fontSize: 'var(--text-xs)',
          fontFamily: 'var(--font-sans)',
          justifyContent: 'space-between',
          transition: 'background var(--t-fast)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s2)' }}>
          <svg
            aria-hidden="true"
            width="10"
            height="10"
            viewBox="0 0 10 10"
            style={{
              transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform var(--t-base)',
              flexShrink: 0,
            }}
          >
            <path
              d="M3 2L7 5L3 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span style={{ fontWeight: 'var(--weight-medium)' }}>{title}</span>
        </div>
        {badge}
      </button>
      {open && (
        <div
          style={{
            padding: 'var(--s3)',
            background: 'var(--bg-base)',
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/* ── Skeleton ── */

interface SkeletonProps {
  w?: string | number;
  h?: string | number;
  style?: CSSProperties;
}

export function Skeleton({ w = '100%', h = 14, style }: SkeletonProps) {
  return (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: 'var(--r-sm)',
        background: 'var(--bg-overlay)',
        animation: 'pulse 1.6s ease-in-out infinite',
        ...style,
      }}
    />
  );
}

/* ── Tooltip ── */

interface TooltipProps {
  tip: string;
  children: ReactNode;
}

export function Tooltip({ tip, children }: TooltipProps) {
  const [show, setShow] = useState(false);

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: tooltip hover trigger is mouse-only by design
    <div
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div
          style={{
            position: 'absolute',
            bottom: 'calc(100% + 6px)',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--bg-overlay)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--r-sm)',
            padding: '4px 8px',
            whiteSpace: 'nowrap',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-secondary)',
            boxShadow: 'var(--shadow-md)',
            zIndex: 1000,
            pointerEvents: 'none',
            animation: 'fadeIn var(--t-fast) ease',
          }}
        >
          {tip}
        </div>
      )}
    </div>
  );
}

/* ── Toast ── */

interface ToastItem {
  id: string;
  type: 'error' | 'success' | 'info';
  message: string;
}

interface ToastProps {
  toasts: ToastItem[];
  removeToast: (id: string) => void;
}

const toastIcons: Record<ToastItem['type'], string> = {
  error: '\u26A0',
  success: '\u2713',
  info: '\u2139',
};

export function Toast({ toasts, removeToast }: ToastProps) {
  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'var(--s6)',
        right: 'var(--s6)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--s2)',
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--s3)',
            background: 'var(--bg-overlay)',
            border: `1px solid ${t.type === 'error' ? 'var(--status-error-subtle)' : 'var(--border-default)'}`,
            borderRadius: 'var(--r-md)',
            padding: 'var(--s3) var(--s4)',
            boxShadow: 'var(--shadow-lg)',
            minWidth: 260,
            maxWidth: 380,
            animation: 'slideUp 220ms cubic-bezier(0.16,1,0.3,1)',
            pointerEvents: 'all',
          }}
        >
          <span style={{ fontSize: 14, flexShrink: 0 }}>{toastIcons[t.type]}</span>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-primary)', flex: 1 }}>
            {t.message}
          </span>
          <button
            type="button"
            onClick={() => removeToast(t.id)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-tertiary)',
              padding: 2,
              lineHeight: 1,
              fontSize: 14,
            }}
          >
            \u00D7
          </button>
        </div>
      ))}
    </div>
  );
}

/* ── Modal ── */

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: ReactNode;
  width?: number;
}

export function Modal({ open, onClose, title, children, width = 480 }: ModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    backdropRef.current?.focus({ preventScroll: true });
  }, [open]);

  if (!open) {
    return null;
  }

  return (
    <div
      ref={backdropRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 900,
        background: 'oklch(0% 0 0 / 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'fadeIn 150ms ease',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          onClose();
        }
      }}
    >
      <div
        style={{
          width,
          maxWidth: '90vw',
          maxHeight: '85vh',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--r-xl)',
          boxShadow: 'var(--shadow-xl)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'scaleIn var(--t-enter)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'var(--s4) var(--s5)',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <h3
            style={{
              fontSize: 'var(--text-md)',
              fontWeight: 'var(--weight-semibold)',
              color: 'var(--text-primary)',
            }}
          >
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-tertiary)',
              width: 24,
              height: 24,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--r-sm)',
              fontSize: 16,
            }}
          >
            \u00D7
          </button>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 'var(--s5)' }}>{children}</div>
      </div>
    </div>
  );
}

/* ── Divider ── */

interface DividerProps {
  label?: string;
}

export function Divider({ label }: DividerProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--s3)',
        margin: 'var(--s2) 0',
      }}
    >
      <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
      {label && (
        <span
          style={{
            fontSize: 'var(--text-2xs)',
            color: 'var(--text-tertiary)',
            letterSpacing: 'var(--tracking-wide)',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
      )}
      <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
    </div>
  );
}
