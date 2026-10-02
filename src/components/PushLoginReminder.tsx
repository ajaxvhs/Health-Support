import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";

interface PushLoginReminderProps {
  onActivate: () => void;
  onDismiss: () => void;
  activating: boolean;
}

export function PushLoginReminder({ onActivate, onDismiss, activating }: PushLoginReminderProps) {
  const [secondsLeft, setSecondsLeft] = useState(30);

  useEffect(() => {
    const deadline = Date.now() + 30_000;
    const intervalId = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0) {
        window.clearInterval(intervalId);
        onDismiss();
      }
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [onDismiss]);

  return (
    <section
      role="status"
      aria-live="polite"
      className="fixed right-3 top-3 z-[60] w-[min(24rem,calc(100vw-1.5rem))] rounded-2xl border border-line-strong bg-surface p-4 shadow-xl sm:right-5 sm:top-5"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-contrast">
          <BellRing size={19} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="pr-1 text-sm font-bold text-ink">Notificações neste dispositivo</p>
          <p className="mt-1 text-sm leading-5 text-muted">
            Receba avisos de novos chamados e respostas neste navegador.
          </p>
        </div>
      </div>
      <div className="mt-4 grid w-full grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onDismiss}
          className="flex min-h-11 w-full items-center justify-center gap-3 rounded-xl border border-line-strong bg-surface px-2 py-2 text-center text-sm font-semibold text-ink transition-colors hover:border-brand-hover hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-focus focus-visible:ring-offset-2"
        >
          <span className="grid w-full max-w-32 grid-cols-[minmax(0,1fr)_3rem] items-center gap-2">
            <span className="whitespace-nowrap text-center">Agora não</span>
            <span
              aria-hidden="true"
              className="flex h-6 w-12 shrink-0 items-center justify-center rounded-md bg-surface-muted font-mono text-xs tabular-nums text-muted"
            >
              {`00:${String(secondsLeft).padStart(2, "0")}`}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={onActivate}
          disabled={activating}
          className="flex min-h-11 w-full items-center justify-center rounded-xl bg-brand-strong px-2 py-2 text-center text-sm font-semibold text-on-brand transition-colors hover:bg-brand-deep disabled:cursor-wait disabled:opacity-70"
        >
          {activating ? "Ativando…" : "Reativar notificações"}
        </button>
      </div>
    </section>
  );
}
