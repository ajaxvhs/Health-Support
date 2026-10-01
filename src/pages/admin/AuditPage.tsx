import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, BookOpen, RefreshCw, RotateCcw, Search, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { FilterField, FilterToolbar, type FilterChip } from "../../components/filters";
import {
  Avatar,
  Button,
  CustomSelect,
  EmptyState,
  PageHeader,
  StatCard,
  TicketPriorityBadge,
  TicketStatusBadge,
} from "../../components/ui";
import { Pagination } from "../../components/Pagination";
import { DateRangePicker } from "../../components/DateRangePicker";
import { useApp } from "../../context/AppContext";
import { auditEventLabels, auditEventPriorityIds, auditEventStatus } from "../../lib/audit";
import { PAGE_SIZE, getPagination } from "../../lib/pagination";
import {
  FETCH_BATCH_SIZE,
  PAGES_PER_BATCH,
  fetchBatchOffset,
  pageOffsetWithinBatch,
} from "../../lib/pageBatch";
import { queryCache } from "../../lib/queryCache";
import { userById } from "../../lib/selectors";
import { formatDate, formatDateKey, localDateKey } from "../../lib/utils";
import type { AppData, TicketEvent } from "../../types";
import { useToast } from "../../context/useToast";
import { SkeletonTableRows, SkeletonText } from "../../components/Skeleton";
import { errorMessage } from "../../lib/utils";

function AuditEventDetail({ event, data }: { event: TicketEvent; data: AppData }) {
  const status = auditEventStatus(event, data.statuses);
  if (
    status &&
    [
      "created",
      "status_changed",
      "resolved",
      "closed",
      "reopened",
      "claimed",
      "released",
      "assigned",
      "reassigned",
    ].includes(event.type)
  ) {
    const label =
      event.type === "created"
        ? "Chamado criado com status"
        : event.type === "status_changed"
          ? "Situação alterada para"
          : auditEventLabels[event.type];
    return (
      <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <span>{label}</span>
        <TicketStatusBadge status={status} />
      </span>
    );
  }

  const priorityIds = auditEventPriorityIds(event, data.priorities);
  if (event.type === "priority_changed" && priorityIds) {
    return (
      <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <span>Prioridade alterada de</span>
        <TicketPriorityBadge priority={priorityIds[0]} data={data} />
        <span>para</span>
        <TicketPriorityBadge priority={priorityIds[1]} data={data} />
      </span>
    );
  }

  return event.detail;
}

export function AuditPage() {
  const { data, user, repo } = useApp();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [actorId, setActorId] = useState("");
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [settledSearch, setSettledSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const dateBound = (value: string, isEnd: boolean) => {
    if (!value) return undefined;
    const [year, month, day] = value.split("-").map(Number);
    return new Date(
      year,
      month - 1,
      day,
      isEnd ? 23 : 0,
      isEnd ? 59 : 0,
      isEnd ? 59 : 0,
      isEnd ? 999 : 0,
    ).toISOString();
  };
  const auditQuery = useMemo(
    () => ({
      actorId,
      type,
      from: dateBound(from, false),
      to: dateBound(to, true),
      search: settledSearch,
      offset: fetchBatchOffset(page),
      limit: FETCH_BATCH_SIZE,
    }),
    [actorId, from, page, settledSearch, to, type],
  );
  const auditQueryState = useQuery({
    queryKey: ["audit-pages", user.id, auditQuery],
    queryFn: () => repo.getAuditEventsPage(auditQuery),
    ...queryCache.auditPages,
  });
  useEffect(() => {
    if (auditQueryState.error)
      showToast(
        errorMessage(auditQueryState.error, "Não foi possível carregar a auditoria."),
        "error",
      );
  }, [auditQueryState.error, showToast]);
  const pageResult = auditQueryState.data;
  const totalCount = pageResult?.totalCount ?? 0;
  const { page: currentPage, pageCount, start, end } = getPagination(page, totalCount);
  const pageWithinBatch = pageOffsetWithinBatch(currentPage) / PAGE_SIZE;
  const events =
    pageResult?.events.slice(pageWithinBatch * PAGE_SIZE, (pageWithinBatch + 1) * PAGE_SIZE) ?? [];
  const eventTypes = Object.keys(auditEventLabels);
  const summary = {
    eventCount: totalCount,
    ticketCount: pageResult?.ticketCount ?? 0,
    actorCount: pageResult?.actorCount ?? 0,
  };
  useEffect(() => {
    if (!auditQueryState.data || currentPage % PAGES_PER_BATCH !== 0 || currentPage >= pageCount)
      return;
    const nextQuery = { ...auditQuery, offset: auditQuery.offset + FETCH_BATCH_SIZE };
    void queryClient.prefetchQuery({
      queryKey: ["audit-pages", user.id, nextQuery],
      queryFn: () => repo.getAuditEventsPage(nextQuery),
      ...queryCache.auditPages,
    });
  }, [auditQuery, auditQueryState.data, currentPage, pageCount, queryClient, repo, user.id]);
  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettledSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  const clear = () => {
    setPage(1);
    setSearch("");
    setActorId("");
    setType("");
    setFrom("");
    setTo("");
  };
  const filterChips: FilterChip[] = [];
  if (search.trim())
    filterChips.push({
      key: "search",
      label: `Busca: ${search.trim()}`,
      onRemove: () => updateSearch(""),
    });
  if (actorId)
    filterChips.push({
      key: "actor",
      label: `Responsável: ${userById(data, actorId)?.fullName ?? "Selecionado"}`,
      onRemove: () => updateActor(""),
    });
  if (type)
    filterChips.push({
      key: "type",
      label: `Ação: ${auditEventLabels[type] ?? type}`,
      onRemove: () => updateType(""),
    });
  if (from || to)
    filterChips.push({
      key: "date",
      label: `Período: ${formatDateKey(from || to)} – ${formatDateKey(to || localDateKey(new Date()))}`,
      onRemove: () => {
        setDateRange("", "");
      },
    });
  const activeFilters = filterChips.length;
  const updateSearch = (value: string) => {
    setPage(1);
    setSearch(value);
  };
  const updateActor = (value: string) => {
    setPage(1);
    setActorId(value);
  };
  const updateType = (value: string) => {
    setPage(1);
    setType(value);
  };
  const setDateRange = (nextFrom: string, nextTo: string) => {
    setPage(1);
    setFrom(nextFrom);
    setTo(nextTo);
  };
  const reload = async () => {
    await auditQueryState.refetch();
  };

  return (
    <>
      <PageHeader
        stackUntil="tablet"
        eyebrow="Administração"
        title="Auditoria"
        description="Histórico append-only das alterações relevantes do sistema."
        action={
          <div className="flex w-full justify-end sm:w-auto">
            <Button variant="secondary" onClick={reload} loading={auditQueryState.isFetching}>
              {!auditQueryState.isFetching && <RefreshCw size={16} />} Atualizar
            </Button>
          </div>
        }
      />
      <div
        className="mb-5 grid gap-4 min-[1120px]:grid-cols-3"
        role={auditQueryState.isLoading ? "status" : undefined}
        aria-label={auditQueryState.isLoading ? "Carregando indicadores da auditoria" : undefined}
        aria-busy={auditQueryState.isLoading}
      >
        <StatCard
          label="Eventos no período"
          value={
            auditQueryState.isLoading ? <SkeletonText className="h-6 w-12" /> : summary.eventCount
          }
          icon={Activity}
          compact
        />
        <StatCard
          label="Chamados com movimentação"
          value={
            auditQueryState.isLoading ? <SkeletonText className="h-6 w-12" /> : summary.ticketCount
          }
          icon={BookOpen}
          tone="blue"
          compact
        />
        <StatCard
          label="Pessoas que atuaram"
          value={
            auditQueryState.isLoading ? <SkeletonText className="h-6 w-12" /> : summary.actorCount
          }
          icon={Users}
          tone="orange"
          compact
        />
      </div>
      <section className="relative rounded-2xl border border-line-soft bg-surface shadow-soft">
        <div className="relative z-20 border-b border-line-soft px-5 py-5 sm:px-7">
          <h2 className="font-display font-bold text-ink">Atividade recente</h2>
          <p className="mt-1 text-xs text-subtle">
            Filtre por responsável, período, ação ou texto.
          </p>
          <div className="mt-4">
            <FilterToolbar
              search={search}
              onSearch={updateSearch}
              searchPlaceholder="Buscar no histórico ou chamado (#1)"
              stackUntil="tablet"
              open={showFilters}
              onToggle={() => setShowFilters((current) => !current)}
              panelId="audit-filter-panel"
              chips={filterChips}
              onClear={clear}
              panelContainerClassName="min-[1120px]:mx-auto min-[1120px]:max-w-[66.5rem]"
              panelClassName="min-[1120px]:grid-cols-[repeat(3,minmax(0,20rem))] min-[1120px]:justify-center"
            >
              <FilterField label="Responsável">
                <CustomSelect
                  ariaLabel="Filtrar por responsável"
                  value={actorId}
                  onChange={updateActor}
                  compact
                  options={[
                    { value: "", label: "Todos os responsáveis" },
                    ...data.profiles.map((profile) => ({
                      value: profile.id,
                      label: profile.fullName,
                    })),
                  ]}
                />
              </FilterField>
              <FilterField label="Ação">
                <CustomSelect
                  ariaLabel="Filtrar por ação"
                  value={type}
                  onChange={updateType}
                  compact
                  options={[
                    { value: "", label: "Todas as ações" },
                    ...eventTypes.map((value) => ({
                      value,
                      label: auditEventLabels[value] ?? value,
                    })),
                  ]}
                />
              </FilterField>
              <FilterField label="Período">
                <DateRangePicker from={from} to={to} onChange={setDateRange} />
              </FilterField>
            </FilterToolbar>
          </div>
        </div>
        <div className="divide-y divide-line-soft" aria-busy={auditQueryState.isLoading}>
          {auditQueryState.isLoading ? (
            <div role="status" aria-busy="true" aria-label="Carregando auditoria">
              <SkeletonTableRows count={6} />
            </div>
          ) : auditQueryState.isError && !pageResult ? (
            <div className="p-8 text-center">
              <p className="text-sm text-muted">Não foi possível carregar a auditoria.</p>
              <Button
                variant="secondary"
                className="mt-3"
                onClick={() => void auditQueryState.refetch()}
              >
                Tentar novamente
              </Button>
            </div>
          ) : events.length ? (
            events.map((event) => {
              const actor = userById(data, event.actorId);
              return (
                <div
                  key={event.id}
                  className="flex min-h-40 items-center gap-3 px-5 py-3 sm:h-[5.5rem] sm:min-h-[5.5rem] sm:px-7"
                >
                  <Avatar user={actor} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-secondary">
                      <strong className="text-ink">{actor?.fullName ?? "Usuário removido"}</strong>{" "}
                      <span className="block sm:inline">
                        <AuditEventDetail event={event} data={data} />{" "}
                        {event.ticketId && (
                          <Link
                            className="font-bold text-brand hover:underline"
                            to={`/chamados/${event.ticketId}`}
                          >
                            #{event.ticketNumber ?? "?"}
                          </Link>
                        )}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-subtle">{formatDate(event.createdAt, true)}</p>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-4 sm:p-6">
              <EmptyState
                icon={
                  totalCount || (!search && !actorId && !type && !from && !to) ? Activity : Search
                }
                title={totalCount ? "Nenhum evento encontrado" : "Nenhum evento registrado"}
                text={
                  totalCount
                    ? "Nenhum evento corresponde aos filtros selecionados."
                    : "As alterações relevantes do sistema aparecerão aqui."
                }
                action={
                  activeFilters > 0 ? (
                    <Button variant="ghost" onClick={clear} className="text-xs">
                      <RotateCcw size={13} /> Limpar filtros
                    </Button>
                  ) : undefined
                }
              />
            </div>
          )}
        </div>
        {totalCount > 0 && (
          <Pagination
            currentPage={currentPage}
            pageCount={pageCount}
            start={start}
            end={end}
            total={totalCount}
            itemLabel="eventos"
            ariaLabel="Paginação da auditoria"
            onPageChange={setPage}
          />
        )}
      </section>
    </>
  );
}
