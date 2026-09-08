import { useCallback, useState, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "../lib/utils";
import { ToastContext, type ToastItem, type ToastKind } from "./toast";

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const dismiss = useCallback((id: number) => {
    setToasts((items) => items.filter((item) => item.id !== id));
  }, []);
  const showToast = useCallback(
    (message: string, kind: ToastKind = "success") => {
      const id = Date.now() + Math.random();
      setToasts((items) => [...items.slice(-3), { id, message, kind }]);
      window.setTimeout(() => dismiss(id), 4500);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-4 top-4 z-[200] flex flex-col items-end gap-3 sm:left-auto sm:right-6 sm:max-w-sm"
        aria-live="polite"
        aria-atomic="true"
      >
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const Icon =
    toast.kind === "success" ? CheckCircle2 : toast.kind === "error" ? AlertCircle : Info;
  return (
    <div
      className={cn(
        "pointer-events-auto flex w-full items-start gap-3 rounded-2xl border bg-white px-4 py-3.5 shadow-float animate-toast-in",
        toast.kind === "success" && "border-emerald-100",
        toast.kind === "error" && "border-red-100",
        toast.kind === "info" && "border-blue-100",
      )}
      role={toast.kind === "error" ? "alert" : "status"}
    >
      <Icon
        size={19}
        className={cn(
          "mt-0.5 shrink-0",
          toast.kind === "success" && "text-emerald-600",
          toast.kind === "error" && "text-red-600",
          toast.kind === "info" && "text-blue-600",
        )}
      />
      <p className="flex-1 text-sm font-semibold leading-5 text-ink">{toast.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-ink"
        aria-label="Fechar aviso"
      >
        <X size={16} />
      </button>
    </div>
  );
}
