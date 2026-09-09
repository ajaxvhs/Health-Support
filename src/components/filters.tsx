import type { ReactNode } from "react";
import { RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { cn } from "../lib/utils";
import { Button, TopSearch } from "./ui";

export interface FilterChip {
  key: string;
  label: string;
  onRemove: () => void;
  icon?: ReactNode;
}

export function FilterField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("block min-w-0", className)}>
      <span className="mb-1.5 block text-xs font-semibold text-slate-500">{label}</span>
      {children}
    </div>
  );
}

export function FilterToolbar({
  search,
  onSearch,
  searchPlaceholder,
  open,
  onToggle,
  panelId,
  chips,
  onClear,
  panelClassName,
  children,
}: {
  search: string;
  onSearch: (value: string) => void;
  searchPlaceholder?: string;
  open: boolean;
  onToggle: () => void;
  panelId: string;
  chips: FilterChip[];
  onClear: () => void;
  panelClassName?: string;
  children: ReactNode;
}) {
  return (
    <>
      <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <TopSearch
          value={search}
          onSearch={onSearch}
          placeholder={searchPlaceholder}
          className="w-full min-w-0 max-w-none"
        />
        <Button
          variant={open ? "primary" : "secondary"}
          className="min-h-10 w-full shrink-0 px-3 sm:min-h-12 sm:w-auto sm:px-4"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
        >
          <SlidersHorizontal size={16} />
          <span>Filtros</span>
          {chips.length > 0 && (
            <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">
              {chips.length}
            </span>
          )}
        </Button>
      </div>

      {chips.length > 0 && (
        <div
          className="mt-3 flex min-h-8 min-w-0 flex-wrap items-center gap-2 border-t border-slate-100 pt-3"
          aria-label="Filtros ativos"
        >
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={chip.onRemove}
              className="inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border border-teal-100 bg-teal-50 px-3 text-[11px] font-bold text-teal-800 transition hover:border-teal-200 hover:bg-teal-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
              aria-label={`Remover filtro ${chip.label}`}
            >
              {chip.icon}
              {chip.label}
              <X size={13} />
            </button>
          ))}
          <Button
            type="button"
            variant="ghost"
            onClick={onClear}
            className="min-h-8 px-2 text-[11px] font-bold text-slate-500 hover:text-teal-700"
            aria-label="Limpar filtros ativos"
          >
            <RotateCcw size={13} /> Limpar filtros
          </Button>
        </div>
      )}

      <div
        aria-hidden={!open}
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-200 ease-out",
          open ? "grid-rows-[1fr] opacity-100" : "pointer-events-none grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div id={panelId} className="mt-3 border-t border-slate-100 pt-3">
            <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 sm:p-4">
              <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2", panelClassName)}>
                {children}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
