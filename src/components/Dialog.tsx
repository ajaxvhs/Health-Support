import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "../lib/utils";

export function Dialog({
  title,
  description,
  onClose,
  children,
  maxWidth = "max-w-lg",
  role = "dialog",
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: "max-w-md" | "max-w-lg" | "max-w-2xl";
  role?: "dialog" | "alertdialog";
}) {
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-ink/40 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          "max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-slate-100 bg-white p-6 shadow-xl",
          maxWidth,
        )}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="font-display text-lg font-bold text-ink">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-sm leading-6 text-slate-500">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label={`Fechar ${title.toLowerCase()}`}
            onClick={onClose}
            className="cursor-pointer rounded-lg p-2 text-slate-400 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
