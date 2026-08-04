import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode, SelectHTMLAttributes } from "react"
import { forwardRef } from "react"

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost"

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  busy?: boolean
}

/** Shared buttons retain native semantics while presenting consistent busy and disabled states. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", busy = false, className = "", children, ...props }, ref) => {
    const variants: Record<ButtonVariant, string> = {
      primary: "bg-primary text-primary-foreground hover:opacity-90",
      secondary: "border bg-surface hover:bg-foreground/5",
      danger: "bg-danger text-danger-foreground hover:opacity-90",
      ghost: "hover:bg-foreground/5",
    }
    return (
      <button
        ref={ref}
        {...props}
        className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
        disabled={busy || props.disabled}
        aria-busy={busy || undefined}
      >
        {busy ? "Working…" : children}
      </button>
    )
  },
)

Button.displayName = "Button"

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: "neutral" | "success" | "warning" | "danger" | "info"
}

/** Compact badges pair color with text so state is never communicated by color alone. */
export const Badge = ({ tone = "neutral", className = "", ...props }: BadgeProps) => {
  const tones = {
    neutral: "bg-foreground/10 text-foreground",
    success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    warning: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    danger: "bg-danger/15 text-danger",
    info: "bg-primary/15 text-primary",
  }
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${tones[tone]} ${className}`}
      {...props}
    />
  )
}

/** Progress includes a screen-reader label and clamps invalid values defensively. */
export const ProgressBar = ({ value, label }: { value: number; label: string }) => {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span>{label}</span>
        <span>{Math.round(clamped)}%</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-border"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clamped)}
      >
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  )
}

export const EmptyState = ({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) => (
  <div className="rounded-2xl border border-dashed p-6 text-center">
    <h3 className="font-semibold">{title}</h3>
    <p className="af-muted my-2">{description}</p>
    {action}
  </div>
)

export const ErrorState = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <div
    className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm text-danger"
    role="alert"
  >
    <p>{message}</p>
    {onRetry === undefined ? null : (
      <Button className="mt-2" variant="secondary" onClick={onRetry}>
        Try again
      </Button>
    )}
  </div>
)

export const LoadingState = ({ label = "Loading AutoFlow…" }: { label?: string }) => (
  <div className="space-y-3" role="status" aria-label={label}>
    <p className="af-muted">{label}</p>
    <div className="h-20 animate-pulse rounded-2xl bg-foreground/10" />
    <div className="h-12 animate-pulse rounded-2xl bg-foreground/10" />
  </div>
)

export interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string
  id: string
  hint?: string
  children: ReactNode
}

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  ({ label, id, hint, children, ...props }, ref) => (
    <div>
      <label className="af-label" htmlFor={id}>
        {label}
      </label>
      <select ref={ref} id={id} className="af-field" {...props}>
        {children}
      </select>
      {hint === undefined ? null : <p className="mt-1 text-xs text-foreground/60">{hint}</p>}
    </div>
  ),
)

SelectField.displayName = "SelectField"
