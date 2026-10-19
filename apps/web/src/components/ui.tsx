import { AlertCircle, Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ');
export { cx };

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary:
    'bg-ink text-paper hover:bg-ink-soft shadow-soft disabled:bg-muted disabled:text-paper-deep',
  secondary: 'bg-card text-ink border border-line hover:border-ink/30 shadow-soft',
  ghost: 'text-ink-soft hover:bg-paper-deep',
  danger: 'bg-card text-coral-deep border border-coral/30 hover:bg-coral-soft',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}) {
  return (
    <button
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-200 active:scale-[0.98] disabled:cursor-not-allowed',
        size === 'sm' && 'h-9 px-4 text-sm',
        size === 'md' && 'h-11 px-5 text-sm',
        size === 'lg' && 'h-13 px-7 text-base',
        BUTTON_STYLES[variant],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cx('rounded-3xl border border-line bg-card p-6 shadow-soft', className)}>
      {children}
    </div>
  );
}

export function Pill({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: 'neutral' | 'coral' | 'sage' | 'butter' | 'ink';
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    neutral: 'bg-paper-deep text-ink-soft',
    coral: 'bg-coral-soft text-coral-deep',
    sage: 'bg-sage-soft text-sage',
    butter: 'bg-butter-soft text-[#8a6416]',
    ink: 'bg-ink text-paper',
  };
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  disabled,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-full border border-line bg-paper-deep p-1"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cx(
              'inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-all disabled:opacity-50',
              active ? 'bg-card text-ink shadow-soft' : 'text-muted hover:text-ink',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted">{children}</p>;
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-24 text-muted" role="status">
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}

export function ErrorPanel({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <Card className="mx-auto max-w-lg text-center">
      <AlertCircle className="mx-auto size-8 text-coral" aria-hidden />
      <h2 className="mt-3 font-display text-2xl">{title}</h2>
      <p className="mt-2 text-sm text-muted">{message}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </Card>
  );
}
