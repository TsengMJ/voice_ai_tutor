import { LIMITS, type Mode } from '@tutor/core/browser';
import { ArrowUp } from 'lucide-react';
import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { cx } from '../components/ui';

export function Composer({
  mode,
  disabled,
  draft,
  onDraftChange,
  onSend,
}: {
  mode: Mode;
  disabled: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: (text: string) => void;
}) {
  const [focused, setFocused] = useState(false);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (!draft.trim() || disabled) return;
    onSend(draft);
    onDraftChange('');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form
      onSubmit={submit}
      className={cx(
        'flex items-end gap-2 rounded-[1.5rem] border bg-card p-2 pl-4 shadow-soft transition-colors',
        focused ? 'border-ink/30' : 'border-line',
      )}
    >
      <textarea
        value={draft}
        onChange={(e) => onDraftChange(e.target.value.slice(0, LIMITS.maxTextLength))}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        rows={1}
        disabled={disabled}
        aria-label="Message your tutor"
        placeholder={mode === 'voice' ? 'Speak, or type a message…' : 'Type your reply…'}
        className="max-h-32 min-h-10 flex-1 resize-none bg-transparent py-2.5 text-[15px] outline-none placeholder:text-muted disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={disabled || !draft.trim()}
        aria-label="Send"
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-coral text-white transition-all hover:bg-coral-deep disabled:bg-line disabled:text-muted"
      >
        <ArrowUp className="size-5" />
      </button>
    </form>
  );
}
