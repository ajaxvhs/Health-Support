import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Filter, Plus, RefreshCw, Ticket as TicketIcon } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { Button, EmptyState, PageHeader } from "../../components/ui";
import { Pagination } from "../../components/Pagination";
import { useApp } from "../../context/AppContext";
import { useToast } from "../../context/useToast";
import { isStaff as hasStaffAccess } from "../../lib/permissions";
import { PAGE_SIZE } from "../../lib/pagination";
import {
  FETCH_BATCH_SIZE,
  PAGES_PER_BATCH,
  fetchBatchOffset,
  pageOffsetWithinBatch,
} from "../../lib/pageBatch";
import { queryCache } from "../../lib/queryCache";
import { errorMessage, type TicketFilters } from "../../lib/utils";
import type { TicketStatus } from "../../types";
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
  queueUnassignedCount,
  queueInProgressCount,
  onChange,
}: {
  view: TicketFilterView;
  queueUnassignedCount: number;
  queueInProgressCount: number;
  onChange: (view: TicketFilterView) => void;
}) {
  return (
    <div className="mb-4 flex flex-col gap-3 min-[1120px]:flex-row min-[1120px]:items-center min-[1120px]:justify-between">
      <div
        role="tablist"
        aria-label="Visualização dos chamados"
        className="grid w-full grid-cols-2 gap-1 rounded-xl border border-line bg-surface p-1 shadow-sm min-[1120px]:inline-flex min-[1120px]:w-auto min-[1120px]:flex-wrap"
      >
        <button
          type="button"
          role="tab"
          aria-selected={view === "queue"}
          onClick={() => onChange("queue")}
          className={`inline-flex min-h-12 min-w-0 cursor-pointer items-center justify-center gap-2 rounded-lg px-2 text-center text-xs font-bold transition min-[1120px]:min-w-[190px] min-[1120px]:px-3.5 ${view === "queue" ? "bg-brand-strong text-on-brand shadow-sm" : "text-muted hover:bg-surface-soft hover:text-ink"}`}
        >
          <ClipboardList size={14} /> Fila de atendimento
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "all"}
          onClick={() => onChange("all")}
          className={`inline-flex min-h-12 min-w-0 cursor-pointer items-center justify-center gap-2 rounded-lg px-2 text-center text-xs font-bold transition min-[1120px]:min-w-[190px] min-[1120px]:px-3.5 ${view === "all" ? "bg-brand-strong text-on-brand shadow-sm" : "text-muted hover:bg-surface-soft hover:text-ink"}`}
        >
          <TicketIcon size={14} /> Todos os chamados
        </button>
      </div>
      {view === "queue" && (
        <div className="grid w-full grid-cols-2 gap-2 text-center min-[1120px]:w-[240px]">
          <div className="rounded-xl bg-danger-soft px-3 py-2">
            <strong className="block text-lg text-danger">{queueUnassignedCount}</strong>
            <span className="text-[10px] font-bold text-danger-strong">Sem responsável</span>
          </div>
          <div className="rounded-xl bg-caution-soft px-3 py-2">
            <strong className="block text-lg text-caution">{queueInProgressCount}</strong>
            <span className="text-[10px] font-bold text-caution-strong">Em atendimento</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function TicketsPage() {
  const { data, user, repo, refreshTicketNavigationCounts } = useApp();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const isStaff = hasStaffAccess(user.role);
  const [view, setView] = useState<TicketFilterView>(() =>
    viewFromSearchParams(searchParams, isStaff),
  );
  const [filtersByView, setFiltersByView] = useState(initialFiltersByView);
  const [assignedByView, setAssignedByView] = useState(initialAssignedByView);
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [settledSearch, setSettledSearch] = useState("");

  useEffect(() => {
    const nextView = viewFromSearchParams(searchParams, isStaff);
    setView((current) => (current === nextView ? current : nextView));
  }, [isStaff, searchParams]);

  const filters = filtersByView[view];
  const assignedToMeOnly = assignedByView[view];
  const createdAfter = useMemo(() => {
    const now = new Date();
    if (filters.dateRange === "today")
      return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    if (filters.dateRange === "7d") return new Date(now.getTime() - 7 * 86400000).toISOString();
    if (filters.dateRange === "30d") return new Date(now.getTime() - 30 * 86400000).toISOString();
    return undefined;
  }, [filters.dateRange]);
  const ticketQuery = useMemo(
    () => ({
      view,
      assignedToMeOnly: assignedToMeOnly && isStaff,
      status: filters.status,
      statusSelection: view === "mine" ? (filters.statusSelection ?? []) : [],
      priorityId: filters.priorityId || undefined,
      unitId: filters.unitId || undefined,
      requesterId: view === "all" ? filters.requesterId || undefined : undefined,
      search: settledSearch,
      createdAfter,
      sort: filters.sort,
      offset: fetchBatchOffset(page),
      limit: FETCH_BATCH_SIZE,
    }),
    [
      assignedToMeOnly,
      createdAfter,
      filters.priorityId,
      filters.requesterId,
      filters.sort,
      filters.status,
      filters.statusSelection,
      filters.unitId,
      isStaff,
      page,
      settledSearch,
      view,
    ],
  );
  const ticketQueryState = useQuery({
    queryKey: ["ticket-pages", user.id, ticketQuery],
    queryFn: () => repo.getTicketPage(ticketQuery),
    ...queryCache.ticketPages,
  });
  useEffect(() => {
    if (ticketQueryState.error)
      showToast(
        errorMessage(ticketQueryState.error, "Não foi possível carregar os chamados."),
        "error",
      );
  }, [showToast, ticketQueryState.error]);
  const pageResult = ticketQueryState.data;
  const totalCount = pageResult?.totalCount ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageWithinBatch = pageOffsetWithinBatch(currentPage) / PAGE_SIZE;
  const tickets =
    pageResult?.tickets.slice(pageWithinBatch * PAGE_SIZE, (pageWithinBatch + 1) * PAGE_SIZE) ?? [];
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageEnd = pageStart + tickets.length;
  const pageTickets = tickets;

  useEffect(() => {
    if (!ticketQueryState.data || currentPage % PAGES_PER_BATCH !== 0 || currentPage >= pageCount)
      return;
    const nextQuery = { ...ticketQuery, offset: ticketQuery.offset + FETCH_BATCH_SIZE };
    void queryClient.prefetchQuery({
      queryKey: ["ticket-pages", user.id, nextQuery],
      queryFn: () => repo.getTicketPage(nextQuery),
      ...queryCache.ticketPages,
    });
  }, [currentPage, pageCount, queryClient, repo, ticketQuery, ticketQueryState.data, user.id]);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettledSearch(filters.search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [filters.search]);
  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);
  const updateFilter = (key: keyof TicketFilters, value: string) => {
    setPage(1);
    setFiltersByView((current) => ({
      ...current,
      [view]: { ...current[view], [key]: value } as TicketFilters,
    }));
  };
  const updateStatusSelection = (statuses: TicketStatus[]) => {
    setPage(1);
    setFiltersByView((current) => ({
      ...current,
      [view]: { ...current[view], statusSelection: statuses },
    }));
  };
  const resetFilters = () => {
    setPage(1);
    setFiltersByView((current) => ({ ...current, [view]: { ...initialFiltersByView[view] } }));
    setAssignedByView((current) => ({ ...current, [view]: false }));
  };
  const changeView = (nextView: TicketFilterView) => {
    setPage(1);
    setView(nextView);
    setSearchParams(nextView === "queue" ? {} : { visao: nextView === "all" ? "todos" : "meus" });
  };
  const setAssignedToMeOnly = (active: boolean) => {
    setPage(1);
    setAssignedByView((current) => ({ ...current, [view]: active }));
  };
  const claim = async (ticketId: string) => {
    try {
      await repo.claim(ticketId);
      void queryClient.invalidateQueries({ queryKey: ["ticket-pages", user.id] });
      void queryClient.invalidateQueries({ queryKey: ["ticket-dashboard", user.id] });
      void queryClient.invalidateQueries({ queryKey: ["audit-pages", user.id] });
      void refreshTicketNavigationCounts();
      showToast("Chamado assumido com sucesso.");
    } catch (reason) {
      showToast(errorMessage(reason, "Este chamado já foi assumido."), "error");
    }
  };
  const refreshQueue = async () => {
    try {
      await ticketQueryState.refetch();
      await refreshTicketNavigationCounts();
    } catch (reason) {
      showToast(errorMessage(reason, "Não foi possível atualizar a fila."), "error");
    }
  };

  return (
    <>
      <PageHeader
        stackUntil="tablet"
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
            ? `${totalCount} chamados encontrados`
            : view === "queue"
              ? "Priorize, assuma e acompanhe os chamados das unidades."
              : `${totalCount} chamados encontrados`
        }
        action={
          <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 min-[1120px]:flex min-[1120px]:w-auto">
            <Link to="/chamados/novo" className="w-full min-[1120px]:w-auto min-[1120px]:flex-none">
              <Button className="min-h-12 w-full min-[1120px]:min-w-[190px]">
                <Plus size={17} /> Novo chamado
              </Button>
            </Link>
            {isStaff && view === "queue" && (
              <Button
                variant="secondary"
                className="min-h-12 w-full min-[1120px]:min-w-[190px] min-[1120px]:w-auto min-[1120px]:flex-none"
                onClick={refreshQueue}
                loading={ticketQueryState.isFetching}
              >
                {!ticketQueryState.isFetching && <RefreshCw size={16} />} Atualizar fila
              </Button>
            )}
          </div>
        }
      />
      {isStaff && view !== "mine" && (
        <TicketsViewSwitcher
          view={view}
          queueUnassignedCount={pageResult?.queueUnassignedCount ?? 0}
          queueInProgressCount={pageResult?.queueInProgressCount ?? 0}
          onChange={changeView}
        />
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
        onStatusSelectionChange={updateStatusSelection}
        onToggleFilters={() => setShowFilters((open) => !open)}
        onToggleAssigned={setAssignedToMeOnly}
        onResetFilters={resetFilters}
      />
      <div className="overflow-hidden rounded-2xl border border-line-soft bg-surface shadow-soft">
        {ticketQueryState.isLoading ? (
          <div className="p-8 text-center text-sm text-muted">Carregando chamados…</div>
        ) : ticketQueryState.isError && !pageResult ? (
          <EmptyState
            title="Não foi possível carregar os chamados"
            text="Verifique sua conexão e tente novamente."
            action={
              <Button variant="secondary" onClick={() => void ticketQueryState.refetch()}>
                Tentar novamente
              </Button>
            }
          />
        ) : tickets.length ? (
          <div className="divide-y divide-line-soft">
            {pageTickets.map((ticket) => (
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
        {totalCount > 0 && (
          <Pagination
            currentPage={currentPage}
            pageCount={pageCount}
            start={pageStart}
            end={pageEnd}
            total={totalCount}
            itemLabel="chamados"
            ariaLabel="Paginação de chamados"
            onPageChange={setPage}
          />
        )}
      </div>
    </>
  );
}
