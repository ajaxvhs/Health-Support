import { useEffect, useState } from "react";
import { ClipboardList, Filter, Plus, RefreshCw, Ticket as TicketIcon } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, EmptyState, PageHeader } from "../../components/ui";
import { useApp } from "../../context/AppContext";
import { useToast } from "../../context/useToast";
import { isStaff as hasStaffAccess } from "../../lib/permissions";
import { filterTickets, type TicketFilters } from "../../lib/utils";
import type { AppData } from "../../types";
import { TicketRow } from "./TicketRow";
import { TicketsFilterBar, type TicketFilterView } from "./TicketsFilterBar";

const initialFilters: TicketFilters = {
  search: "",
  status: "todos",
  priorityId: "",
  unitId: "",
  requesterId: "",
  dateRange: "all",
  sort: "newest",
};
const initialFiltersByView: Record<TicketFilterView, TicketFilters> = {
  all: { ...initialFilters },
  mine: { ...initialFilters },
  queue: { ...initialFilters, sort: "priority" },
};
const initialAssignedByView: Record<TicketFilterView, boolean> = {
  all: false,
  mine: false,
  queue: false,
};

function viewFromSearchParams(searchParams: URLSearchParams, isStaff: boolean): TicketFilterView {
  if (!isStaff) return "mine";
  const requestedView = searchParams.get("visao");
  if (requestedView === "todos") return "all";
  if (requestedView === "meus") return "mine";
  if (requestedView === "fila") return "queue";
  return "queue";
}

function TicketsViewSwitcher({
  view,
  data,
  onChange,
}: {
  view: TicketFilterView;
  data: AppData;
  onChange: (view: TicketFilterView) => void;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div
        role="tablist"
        aria-label="Visualização dos chamados"
        className="grid w-full grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm sm:inline-flex sm:w-auto sm:flex-wrap"
      >
        <button
          type="button"
          role="tab"
          aria-selected={view === "queue"}
          onClick={() => onChange("queue")}
          className={`inline-flex min-h-10 min-w-0 cursor-pointer items-center justify-center gap-2 rounded-lg px-2 text-center text-xs font-bold transition sm:px-3.5 ${view === "queue" ? "bg-teal-700 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-ink"}`}
        >
          <ClipboardList size={14} /> Fila de atendimento
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "all"}
          onClick={() => onChange("all")}
          className={`inline-flex min-h-10 min-w-0 cursor-pointer items-center justify-center gap-2 rounded-lg px-2 text-center text-xs font-bold transition sm:px-3.5 ${view === "all" ? "bg-teal-700 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50 hover:text-ink"}`}
        >
          <TicketIcon size={14} /> Todos os chamados
        </button>
      </div>
      {view === "queue" && (
        <div className="grid w-full grid-cols-2 gap-2 text-center sm:w-[240px]">
          <div className="rounded-xl bg-red-50 px-3 py-2">
            <strong className="block text-lg text-red-600">
              {
                data.tickets.filter(
                  (ticket) =>
                    ticket.status !== "fechado" &&
                    ticket.status !== "resolvido" &&
                    !ticket.assignedTo,
                ).length
              }
            </strong>
            <span className="text-[10px] font-bold text-red-700">Sem responsável</span>
          </div>
          <div className="rounded-xl bg-amber-50 px-3 py-2">
            <strong className="block text-lg text-amber-600">
              {data.tickets.filter((ticket) => ticket.status === "em_andamento").length}
            </strong>
            <span className="text-[10px] font-bold text-amber-700">Em atendimento</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function TicketsPage() {
  const { data, user, repo, refresh } = useApp();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const isStaff = hasStaffAccess(user.role);
  const [view, setView] = useState<TicketFilterView>(() =>
    viewFromSearchParams(searchParams, isStaff),
  );
  const [filtersByView, setFiltersByView] = useState(initialFiltersByView);
  const [assignedByView, setAssignedByView] = useState(initialAssignedByView);
  const [showFilters, setShowFilters] = useState(false);
  const [refreshingQueue, setRefreshingQueue] = useState(false);

  useEffect(() => {
    const nextView = viewFromSearchParams(searchParams, isStaff);
    setView((current) => (current === nextView ? current : nextView));
  }, [isStaff, searchParams]);

  const filters = filtersByView[view];
  const assignedToMeOnly = assignedByView[view];

  const scopedTickets =
    view === "mine"
      ? data.tickets.filter((ticket) => ticket.createdBy === user.id)
      : view === "queue"
        ? data.tickets.filter(
            (ticket) => ticket.status !== "fechado" && ticket.status !== "resolvido",
          )
        : data.tickets;
  const visibleScope =
    assignedToMeOnly && isStaff
      ? scopedTickets.filter((ticket) => ticket.assignedTo === user.id)
      : scopedTickets;
  const unitNames = Object.fromEntries(data.units.map((unit) => [unit.id, unit.name]));
  const requesterNames = Object.fromEntries(
    data.profiles.map((profile) => [profile.id, profile.fullName]),
  );
  const priorityOrder = Object.fromEntries(
    data.priorities.map((priority) => [
      priority.id,
      ["urgente", "alta", "media", "baixa"].indexOf(priority.slug ?? ""),
    ]),
  );
  const tickets = filterTickets(visibleScope, filters, {
    unitNames,
    requesterNames,
    priorityOrder,
  });
  const updateFilter = (key: keyof TicketFilters, value: string) =>
    setFiltersByView((current) => ({
      ...current,
      [view]: { ...current[view], [key]: value } as TicketFilters,
    }));
  const resetFilters = () => {
    setFiltersByView((current) => ({ ...current, [view]: { ...initialFiltersByView[view] } }));
    setAssignedByView((current) => ({ ...current, [view]: false }));
  };
  const changeView = (nextView: TicketFilterView) => {
    setView(nextView);
    setSearchParams(nextView === "queue" ? {} : { visao: nextView === "all" ? "todos" : "meus" });
  };
  const setAssignedToMeOnly = (active: boolean) =>
    setAssignedByView((current) => ({ ...current, [view]: active }));
  const claim = async (ticketId: string) => {
    try {
      await repo.claim(ticketId);
      await refresh();
      showToast("Chamado assumido com sucesso.");
    } catch (reason) {
      showToast(
        reason instanceof Error ? reason.message : "Este chamado já foi assumido.",
        "error",
      );
    }
  };
  const refreshQueue = async () => {
    setRefreshingQueue(true);
    try {
      await refresh();
      showToast("Fila atualizada.", "info");
    } catch (reason) {
      showToast(
        reason instanceof Error ? reason.message : "Não foi possível atualizar a fila.",
        "error",
      );
    } finally {
      setRefreshingQueue(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Chamados"
        title={
          view === "mine"
            ? "Meus chamados"
            : view === "queue"
              ? "Fila de atendimento"
              : "Todos os chamados"
        }
        description={
          !isStaff
            ? `${tickets.length} chamados encontrados`
            : view === "queue"
              ? "Priorize, assuma e acompanhe os chamados das unidades."
              : `${tickets.length} chamados encontrados`
        }
        action={
          <div className="flex w-full justify-between gap-3 sm:w-auto">
            <Link to="/chamados/novo" className="flex-1 sm:flex-none">
              <Button className="min-h-12 w-full sm:min-w-[190px]">
                <Plus size={17} /> Novo chamado
              </Button>
            </Link>
            {isStaff && view === "queue" && (
              <Button
                variant="secondary"
                className="min-h-12 flex-1 sm:min-w-[190px] sm:flex-none"
                onClick={refreshQueue}
                loading={refreshingQueue}
              >
                {!refreshingQueue && <RefreshCw size={16} />} Atualizar fila
              </Button>
            )}
          </div>
        }
      />
      {isStaff && view !== "mine" && (
        <TicketsViewSwitcher view={view} data={data} onChange={changeView} />
      )}
      <TicketsFilterBar
        view={view}
        filters={filters}
        data={data}
        isStaff={isStaff}
        showFilters={showFilters}
        assignedToMeOnly={assignedToMeOnly}
        onSearch={(value) => updateFilter("search", value)}
        onFilterChange={updateFilter}
        onToggleFilters={() => setShowFilters((open) => !open)}
        onToggleAssigned={setAssignedToMeOnly}
        onResetFilters={resetFilters}
      />
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-soft">
        {tickets.length ? (
          <div className="divide-y divide-slate-100">
            {tickets.map((ticket) => (
              <TicketRow
                key={ticket.id}
                ticket={ticket}
                data={data}
                queueMode={view === "queue"}
                onClaim={!ticket.assignedTo ? () => claim(ticket.id) : undefined}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Filter}
            title="Nenhum chamado encontrado"
            text="Tente ajustar sua busca ou seus filtros."
          />
        )}
      </div>
    </>
  );
}
