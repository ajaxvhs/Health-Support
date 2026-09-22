import { useEffect, type RefObject } from "react";
import { CheckCheck, Trash2, X } from "lucide-react";
import { cn } from "../lib/utils";
import type { AppNotification } from "../types";

export function NotificationPopover({
  open,
  notifications,
  containerRef,
  onClose,
  onRead,
  onMarkAll,
  onDelete,
  onDeleteAll,
}: {
  open: boolean;
  notifications: AppNotification[];
  containerRef: RefObject<HTMLDivElement>;
  onClose: () => void;
  onRead: (notification: AppNotification) => void | Promise<void>;
  onMarkAll: () => void | Promise<void>;
  onDelete: (notification: AppNotification) => void | Promise<void>;
  onDeleteAll: () => void | Promise<void>;
}) {
  const unreadCount = notifications.filter((notification) => !notification.read).length;
  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [containerRef, onClose, open]);

  if (!open) return null;
  return (
    <div
      id="notifications-popover"
      role="dialog"
      aria-label="Notificações"
      className="fixed left-1/2 top-[5rem] z-[110] w-[calc(100vw-3rem)] max-w-md -translate-x-1/2 overflow-hidden rounded-2xl border border-line bg-surface text-left shadow-float sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:w-[min(360px,calc(100vw-2rem))] sm:translate-x-0"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="border-b border-line-soft px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-sm font-bold text-ink">Notificações</h2>
            <p className="mt-0.5 text-[11px] text-subtle">
              {unreadCount ? `${unreadCount} não lida${unreadCount > 1 ? "s" : ""}` : "Tudo em dia"}
            </p>
          </div>
          <button
            type="button"
            className="cursor-pointer rounded-lg p-2 text-subtle hover:bg-surface-muted"
            aria-label="Fechar notificações"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>
        <div className="mt-2 flex items-center justify-end gap-1">
          {unreadCount > 0 && (
            <button
              type="button"
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-bold text-brand hover:bg-brand-soft"
              aria-label="Marcar tudo como lido"
              onClick={onMarkAll}
            >
              <CheckCheck size={15} /> <span>Marcar tudo como lido</span>
            </button>
          )}
          {notifications.length > 0 && (
            <button
              type="button"
              className="inline-flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-bold text-danger-strong hover:bg-danger-soft"
              aria-label="Excluir todas as notificações"
              onClick={onDeleteAll}
            >
              <Trash2 size={15} /> <span>Excluir</span>
            </button>
          )}
        </div>
      </div>
      <div className="max-h-80 overflow-y-auto p-2 flex flex-col gap-2">
        {notifications.length ? (
          notifications.map((notification) => (
            <div
              key={notification.id}
              className={cn(
                "group flex gap-2 rounded-xl p-3",
                !notification.read && "bg-brand-soft/70",
              )}
            >
              <button
                type="button"
                className="min-w-0 flex-1 cursor-pointer text-left"
                onClick={() => onRead(notification)}
              >
                <span className="flex items-start gap-2">
                  <span
                    className={cn(
                      "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                      notification.read ? "bg-line-strong" : "bg-warning-strong",
                    )}
                  />
                  <span>
                    <strong className="block text-xs font-bold text-ink">
                      {notification.title}
                    </strong>
                    <span className="mt-1 block text-xs leading-5 text-secondary">
                      {notification.message}
                    </span>
                    <span className="mt-1 block text-[10px] text-subtle">
                      {new Intl.DateTimeFormat("pt-BR", {
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(new Date(notification.createdAt))}
                    </span>
                  </span>
                </span>
              </button>
              <button
                type="button"
                aria-label={`Excluir ${notification.title}`}
                className="h-7 shrink-0 cursor-pointer rounded-lg p-1.5 text-subtle opacity-0 transition group-hover:opacity-100 hover:bg-danger-soft hover:text-danger-strong focus-visible:opacity-100"
                onClick={() => onDelete(notification)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))
        ) : (
          <p className="px-3 py-8 text-center text-xs text-subtle">Nenhuma notificação.</p>
        )}
      </div>
    </div>
  );
}
