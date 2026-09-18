import { Check, ChevronDown, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { FilterField, FilterToolbar, type FilterChip } from "../../components/filters";
import { CustomSelect } from "../../components/ui";
import type { TicketFilters, TicketStatusFilter } from "../../lib/utils";
import { statusMeta, type AppData, type TicketStatus } from "../../types";

export type TicketFilterView = "all" | "mine" | "queue";

interface TicketsFilterBarProps {
  view: TicketFilterView;
  filters: TicketFilters;
  data: AppData;
  isStaff: boolean;
  showFilters: boolean;
  assignedToMeOnly: boolean;
  onSearch: (value: string) => void;
  onFilterChange: (key: keyof TicketFilters, value: string) => void;
  onStatusSelectionChange: (statuses: TicketStatus[]) => void;
  onToggleFilters: () => void;
  onToggleAssigned: (active: boolean) => void;
  onResetFilters: () => void;
}

const dateLabels: Record<TicketFilters["dateRange"], string> = {
  all: "Todo o período",
  today: "Hoje",
  "7d": "Últimos 7 dias",
  "30d": "Últimos 30 dias",
};

const defaultMineStatuses: TicketStatus[] = ["aberto", "em_andamento"];

function hasCustomMineStatusSelection(statuses: TicketStatus[]) {
  return (
    statuses.length !== defaultMineStatuses.length ||
    defaultMineStatuses.some((status) => !statuses.includes(status))
  );
}

function getActiveFilterChips(
  view: TicketFilterView,
  filters: TicketFilters,
  data: AppData,
  isStaff: boolean,
  assignedToMeOnly: boolean,
  {
    onFilterChange,
    onStatusSelectionChange,
    onToggleAssigned,
  }: Pick<TicketsFilterBarProps, "onFilterChange" | "onStatusSelectionChange" | "onToggleAssigned">,
) {
  const chips: FilterChip[] = [];
  if (filters.search.trim())
    chips.push({
      key: "search",
      label: `Busca: ${filters.search.trim()}`,
      onRemove: () => onFilterChange("search", ""),
    });
  if (
    view === "mine" &&
    filters.statusSelection?.length &&
    hasCustomMineStatusSelection(filters.statusSelection)
  )
    chips.push({
      key: "status",
      label: `Status: ${filters.statusSelection.map((status) => statusMeta[status].label).join(", ")}`,
      onRemove: () => onStatusSelectionChange([]),
    });
  else if (filters.status !== "todos")
    chips.push({
      key: "status",
      label: `Status: ${statusMeta[filters.status as TicketStatus].label}`,
      onRemove: () => onFilterChange("status", "todos"),
    });
  if (filters.priorityId)
    chips.push({
      key: "priority",
      label: `Prioridade: ${data.priorities.find((item) => item.id === filters.priorityId)?.name ?? "Selecionada"}`,
      onRemove: () => onFilterChange("priorityId", ""),
    });
  if (filters.unitId)
    chips.push({
      key: "unit",
      label: `Unidade: ${data.units.find((item) => item.id === filters.unitId)?.name ?? "Selecionada"}`,
      onRemove: () => onFilterChange("unitId", ""),
    });
  if (view === "all" && filters.requesterId)
    chips.push({
      key: "requester",
      label: `Solicitante: ${data.profiles.find((item) => item.id === filters.requesterId)?.fullName ?? "Selecionado"}`,
      onRemove: () => onFilterChange("requesterId", ""),
    });
  if (filters.dateRange !== "all")
    chips.push({
      key: "period",
      label: `Período: ${dateLabels[filters.dateRange]}`,
      onRemove: () => onFilterChange("dateRange", "all"),
    });
  if (view !== "mine" && isStaff && assignedToMeOnly)
    chips.push({
      key: "assigned",
      label: "Meus atendimentos",
      icon: <UserRound size={13} />,
      onRemove: () => onToggleAssigned(false),
    });
  return chips;
}

export function TicketsFilterBar({
  view,
  filters,
  data,
  isStaff,
  showFilters,
  assignedToMeOnly,
  onSearch,
  onFilterChange,
  onStatusSelectionChange,
  onToggleFilters,
  onToggleAssigned,
  onResetFilters,
}: TicketsFilterBarProps) {
  const chips = getActiveFilterChips(view, filters, data, isStaff, assignedToMeOnly, {
    onFilterChange,
    onStatusSelectionChange,
    onToggleAssigned,
  });
  const sortOptions = [
    { value: "newest", label: "Mais recentes" },
    { value: "oldest", label: "Mais antigos" },
    { value: "priority", label: "Maior prioridade" },
  ];

  return (
    <section className="mb-5 rounded-2xl border border-slate-100 bg-white p-3 shadow-soft sm:p-4">
      <FilterToolbar
        search={filters.search}
        onSearch={onSearch}
        open={showFilters}
        onToggle={onToggleFilters}
        panelId="ticket-filter-panel"
        chips={chips}
        onClear={onResetFilters}
        panelClassName="lg:grid-cols-4"
      >
        <FilterField label="Status">
          {view === "mine" ? (
            <StatusMultiSelect
              selected={filters.statusSelection ?? []}
              onChange={onStatusSelectionChange}
            />
          ) : (
            <CustomSelect
              ariaLabel="Filtrar por status"
              value={filters.status}
              onChange={(value) => onFilterChange("status", value)}
              options={[
                { value: "todos", label: "Todos os status" },
                ...(Object.entries(statusMeta) as Array<[TicketStatus, { label: string }]>).map(
                  ([value, meta]) => ({ value: value as TicketStatusFilter, label: meta.label }),
                ),
              ]}
            />
          )}
        </FilterField>
        <FilterField label="Prioridade">
          <CustomSelect
            ariaLabel="Filtrar por prioridade"
            value={filters.priorityId}
            onChange={(value) => onFilterChange("priorityId", value)}
            options={[
              { value: "", label: "Todas as prioridades" },
              ...data.priorities.map((item) => ({ value: item.id, label: item.name })),
            ]}
          />
        </FilterField>
        <FilterField label="Unidade">
          <CustomSelect
            ariaLabel="Filtrar por unidade"
            value={filters.unitId}
            onChange={(value) => onFilterChange("unitId", value)}
            options={[
              { value: "", label: "Todas as unidades" },
              ...data.units.map((item) => ({ value: item.id, label: item.name })),
            ]}
          />
        </FilterField>
        {view === "all" && (
          <FilterField label="Solicitante">
            <CustomSelect
              ariaLabel="Filtrar por solicitante"
              value={filters.requesterId}
              onChange={(value) => onFilterChange("requesterId", value)}
              options={[
                { value: "", label: "Todos os solicitantes" },
                ...data.profiles
                  .filter((profile) => profile.role === "solicitante")
                  .map((profile) => ({ value: profile.id, label: profile.fullName })),
              ]}
            />
          </FilterField>
        )}
        <FilterField label="Período">
          <CustomSelect
            ariaLabel="Filtrar por período"
            value={filters.dateRange}
            onChange={(value) => onFilterChange("dateRange", value)}
            options={[
              { value: "all", label: "Todo o período" },
              { value: "today", label: "Hoje" },
              { value: "7d", label: "Últimos 7 dias" },
              { value: "30d", label: "Últimos 30 dias" },
            ]}
          />
        </FilterField>
        <FilterField label="Ordenação">
          <CustomSelect
            ariaLabel="Ordenar chamados"
            value={filters.sort}
            onChange={(value) => onFilterChange("sort", value)}
            options={
              view === "queue"
                ? [{ value: "priority", label: "Maior prioridade" }, ...sortOptions.slice(0, 2)]
                : sortOptions
            }
          />
        </FilterField>
      </FilterToolbar>
    </section>
  );
}

function StatusMultiSelect({
  selected,
  onChange,
}: {
  selected: TicketStatus[];
  onChange: (statuses: TicketStatus[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const statuses = Object.entries(statusMeta) as Array<[TicketStatus, { label: string }]>;
  const selectedLabel = selected.length
    ? selected.map((status) => statusMeta[status].label).join(", ")
    : "Todos os status";

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        className="flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3.5 text-left text-sm font-medium text-ink outline-none transition hover:border-teal-300 focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Filtrar por status"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="min-w-0 truncate">{selectedLabel}</span>
        <ChevronDown size={16} className={open ? "shrink-0 rotate-180" : "shrink-0"} />
      </button>
      {open && (
        <div
          className="absolute inset-x-0 top-[calc(100%+0.5rem)] z-30 rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
          role="listbox"
          aria-multiselectable="true"
        >
          {statuses.map(([value, meta]) => {
            const checked = selected.includes(value);
            return (
              <button
                key={value}
                type="button"
                role="option"
                aria-selected={checked}
                className="flex min-h-10 w-full cursor-pointer items-center justify-between rounded-lg px-3 text-left text-sm font-medium text-slate-600 transition hover:bg-teal-50 hover:text-teal-900"
                onClick={() =>
                  onChange(
                    checked ? selected.filter((status) => status !== value) : [...selected, value],
                  )
                }
              >
                {meta.label}
                {checked && <Check size={16} className="text-teal-700" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
