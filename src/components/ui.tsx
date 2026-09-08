import { useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { CheckCircle2, ClipboardList, LoaderCircle, Power, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn, initials } from "../lib/utils";
import { statusMeta, type AppData, type Profile, type TicketStatus } from "../types";
import { Dialog } from "./Dialog";

export { CustomSelect, SelectField, TextField, TopSearch } from "./formControls";
export type { SelectOption } from "./formControls";

export function Button({
  children,
  variant = "primary",
  className,
  loading = false,
  onClick,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const busy = loading || pending;
  return (
    <button
      className={cn(
        "relative inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-teal-700 text-white shadow-sm hover:bg-teal-800",
        variant === "secondary" &&
          "border border-slate-200 bg-white text-ink hover:border-teal-300 hover:bg-teal-50",
        variant === "ghost" && "text-slate-600 hover:bg-slate-100 hover:text-ink",
        variant === "danger" && "bg-red-50 text-red-700 hover:bg-red-100",
        className,
      )}
      {...props}
      onClick={async (event) => {
        if (!onClick || busy) return;
        const result = onClick(event) as unknown as Promise<void> | undefined;
        if (result && typeof result.then === "function") {
          setPending(true);
          try {
            await result;
          } finally {
            setPending(false);
          }
        }
      }}
      disabled={disabled || busy}
    >
      {busy && <LoaderCircle size={16} className="shrink-0 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = "slate",
  dot = false,
}: {
  children: ReactNode;
  tone?: string;
  dot?: boolean;
}) {
  const tones: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700 ring-blue-100",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
    violet: "bg-violet-50 text-violet-700 ring-violet-100",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    slate: "bg-slate-100 text-slate-600 ring-slate-200",
    orange: "bg-orange-50 text-orange-700 ring-orange-100",
    red: "bg-red-50 text-red-700 ring-red-100",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset",
        tones[tone] ?? tones.slate,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Avatar({ user, size = "md" }: { user?: Profile; size?: "sm" | "md" | "lg" }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-xl bg-teal-100 font-bold text-teal-800",
        size === "sm" && "h-8 w-8 rounded-lg text-[10px]",
        size === "md" && "h-10 w-10 text-xs",
        size === "lg" && "h-16 w-16 rounded-2xl text-lg",
      )}
    >
      {user ? initials(user.fullName) : "?"}
    </span>
  );
}

export function EmptyState({
  icon: Icon = ClipboardList,
  title,
  text,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-16 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
        <Icon size={25} />
      </span>
      <h3 className="font-display text-lg font-bold text-ink">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[.16em] text-teal-700">
          {eyebrow}
        </p>
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          {title}
        </h1>
        {description && <p className="mt-2 max-w-2xl text-sm text-slate-500">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function FormActions({ cancel, children }: { cancel: ReactNode; children: ReactNode }) {
  return (
    <div className="mt-7 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
      <div className="w-full sm:w-auto">{cancel}</div>
      <div className="w-full sm:w-auto">{children}</div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "primary",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "primary" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <Dialog
      title={title}
      description={description}
      onClose={onCancel}
      maxWidth="max-w-md"
      role="alertdialog"
    >
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button autoFocus variant={variant} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}

export function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = "teal",
  compact = false,
}: {
  label: string;
  value: string | number;
  detail?: string;
  icon: LucideIcon;
  tone?: "teal" | "orange" | "violet" | "blue";
  compact?: boolean;
}) {
  const tones = {
    teal: "bg-teal-50 text-teal-700",
    orange: "bg-orange-50 text-orange-600",
    violet: "bg-violet-50 text-violet-600",
    blue: "bg-blue-50 text-blue-600",
  };
  return (
    <div
      className={cn(
        "h-full rounded-2xl border border-slate-100 bg-white shadow-soft",
        compact ? "p-4" : "p-5",
      )}
    >
      <div className="flex items-start justify-between">
        <span
          className={cn(
            "flex items-center justify-center rounded-xl",
            compact ? "h-9 w-9" : "h-10 w-10",
            tones[tone],
          )}
        >
          <Icon size={compact ? 17 : 19} />
        </span>
        {detail && <span className="text-[11px] font-bold text-emerald-600">{detail}</span>}
      </div>
      <p className={cn("font-bold text-ink", compact ? "mt-3 text-xl" : "mt-5 text-2xl")}>
        {value}
      </p>
      <p className="mt-1 text-sm text-slate-500">{label}</p>
    </div>
  );
}

export function PillTabs({
  tabs,
  value,
  onChange,
  ariaLabel,
}: {
  tabs: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="mb-6 flex w-full gap-1 rounded-2xl border border-slate-200 bg-slate-100/80 p-1 sm:w-fit"
    >
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          onClick={() => onChange(tab.value)}
          className={cn(
            "min-h-10 flex-1 rounded-xl px-4 text-sm font-bold text-slate-500 transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 sm:flex-none",
            value === tab.value && "bg-white text-teal-800 shadow-sm ring-1 ring-slate-200",
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function BulkActionButtons({
  onActivate,
  onDeactivate,
  onDelete,
}: {
  onActivate: () => void;
  onDeactivate: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        title="Ativar selecionados"
        aria-label="Ativar selecionados"
        className="min-h-12 px-3 text-xs"
        onClick={onActivate}
      >
        <CheckCircle2 size={15} /> <span>Ativar</span>
      </Button>
      <Button
        type="button"
        variant="secondary"
        title="Desativar selecionados"
        aria-label="Desativar selecionados"
        className="min-h-12 px-3 text-xs"
        onClick={onDeactivate}
      >
        <Power size={15} /> <span>Desativar</span>
      </Button>
      <Button
        type="button"
        variant="danger"
        title="Excluir selecionados"
        aria-label="Excluir selecionados"
        className="min-h-12 px-3 text-xs"
        onClick={onDelete}
      >
        <Trash2 size={15} /> <span>Excluir</span>
      </Button>
    </div>
  );
}

export function TicketStatusBadge({ status }: { status: TicketStatus }) {
  const meta = statusMeta[status];
  return (
    <Badge tone={meta.tone} dot>
      {meta.label}
    </Badge>
  );
}

export function TicketPriorityBadge({ priority, data }: { priority: string; data: AppData }) {
  const item = data.priorities.find((priorityItem) => priorityItem.id === priority);
  const tone =
    item?.slug === "urgente"
      ? "red"
      : item?.slug === "alta"
        ? "orange"
        : item?.slug === "media"
          ? "blue"
          : "slate";
  return (
    <Badge tone={tone}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {item?.name ?? "Média"}
    </Badge>
  );
}
