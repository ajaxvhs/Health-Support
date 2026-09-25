import { useEffect, useState } from "react";
import { Activity, BookOpen, Clock3, RefreshCw, RotateCcw, Search } from "lucide-react";
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
import { getPagination } from "../../lib/pagination";
import { userById } from "../../lib/selectors";
import { filterAuditEvents, formatDate } from "../../lib/utils";
import type { AppData, TicketEvent } from "../../types";

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
  const { data, refresh } = useApp();
  const [search, setSearch] = useState("");
  const [actorId, setActorId] = useState("");
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const allEvents = [...data.events].sort(
    (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
  );
  const eventTypes = Object.keys(auditEventLabels);
  const events = filterAuditEvents(allEvents, data.profiles, { search, actorId, type, from, to });
  const { page: currentPage, pageCount, start, end } = getPagination(page, events.length);
  const pageEvents = events.slice(start, end);
  useEffect(() => {
    setPage(1);
  }, [search, actorId, type, from, to]);
  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);
  const clear = () => {
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
      onRemove: () => setSearch(""),
    });
  if (actorId)
    filterChips.push({
      key: "actor",
      label: `Responsável: ${userById(data, actorId)?.fullName ?? "Selecionado"}`,
      onRemove: () => setActorId(""),
    });
  if (type)
    filterChips.push({
      key: "type",
      label: `Ação: ${auditEventLabels[type] ?? type}`,
      onRemove: () => setType(""),
    });
  if (from || to)
    filterChips.push({
      key: "date",
      label: `Período: ${from && to ? `${from} - ${to}` : "Selecionado"}`,
      onRemove: () => {
        setFrom("");
        setTo("");
      },
    });
  const activeFilters = filterChips.length;
  const reload = async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Administração"
        title="Auditoria"
        description="Histórico append-only das alterações relevantes do sistema."
        action={
          <Button variant="secondary" onClick={reload} loading={refreshing}>
            {!refreshing && <RefreshCw size={16} />} Atualizar
          </Button>
        }
      />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <StatCard label="Eventos registrados" value={events.length} icon={Activity} compact />
        <StatCard
          label="Chamados acompanhados"
          value={
            new Set(events.filter((event) => event.ticketId).map((event) => event.ticketId)).size
          }
          icon={BookOpen}
          tone="blue"
          compact
        />
        <StatCard
          label="Ações hoje"
          value={
            events.filter(
              (event) => new Date(event.createdAt).toDateString() === new Date().toDateString(),
            ).length
          }
          icon={Clock3}
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
              onSearch={setSearch}
              searchPlaceholder="Buscar no histórico"
              open={showFilters}
              onToggle={() => setShowFilters((current) => !current)}
              panelId="audit-filter-panel"
              chips={filterChips}
              onClear={clear}
              panelClassName="md:grid-cols-2 lg:grid-cols-3"
            >
              <FilterField label="Responsável">
                <CustomSelect
                  ariaLabel="Filtrar por responsável"
                  value={actorId}
                  onChange={setActorId}
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
                  onChange={setType}
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
                <DateRangePicker
                  from={from}
                  to={to}
                  onChange={(nextFrom, nextTo) => {
                    setFrom(nextFrom);
                    setTo(nextTo);
                  }}
                />
              </FilterField>
            </FilterToolbar>
          </div>
        </div>
        <div className="divide-y divide-line-soft">
          {events.length ? (
            pageEvents.map((event) => {
              const actor = userById(data, event.actorId);
              const ticket = data.tickets.find((item) => item.id === event.ticketId);
              return (
                <div key={event.id} className="flex items-start gap-3 px-5 py-4 sm:px-7">
                  <Avatar user={actor} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-secondary">
                      <strong className="text-ink">{actor?.fullName ?? "Usuário removido"}</strong>{" "}
                      <AuditEventDetail event={event} data={data} />{" "}
                      {ticket && (
                        <Link
                          className="font-bold text-brand hover:underline"
                          to={`/chamados/${ticket.id}`}
                        >
                          #{ticket.number}
                        </Link>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-subtle">{formatDate(event.createdAt, true)}</p>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-4 sm:p-6">
              <EmptyState
                icon={allEvents.length ? Search : Activity}
                title={allEvents.length ? "Nenhum evento encontrado" : "Nenhum evento registrado"}
                text={
                  allEvents.length
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
        {events.length > 0 && (
          <Pagination
            currentPage={currentPage}
            pageCount={pageCount}
            start={start}
            end={end}
            total={events.length}
            itemLabel="eventos"
            ariaLabel="Paginação da auditoria"
            onPageChange={setPage}
          />
        )}
      </section>
    </>
  );
}
