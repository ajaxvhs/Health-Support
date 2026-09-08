import { useState } from "react";
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
} from "../../components/ui";
import { DateRangePicker } from "../../components/DateRangePicker";
import { useApp } from "../../context/AppContext";
import { userById } from "../../lib/selectors";
import { filterAuditEvents, formatDate } from "../../lib/utils";

const eventLabels: Record<string, string> = {
  created: "Chamado aberto",
  assigned: "Atribuição",
  unassigned: "Liberação para a fila",
  status_changed: "Status alterado",
  priority_changed: "Prioridade alterada",
  message_added: "Mensagem adicionada",
  reopened: "Chamado reaberto",
  password_changed: "Senha alterada",
  profile_updated: "Perfil atualizado",
  user_created: "Usuário criado",
  user_updated: "Usuário atualizado",
  user_activated: "Usuário ativado",
  user_deactivated: "Usuário desativado",
  user_deleted: "Usuário excluído",
  role_changed: "Perfil de acesso alterado",
  catalog_created: "Item de catálogo criado",
  catalog_renamed: "Item de catálogo renomeado",
  catalog_activated: "Item de catálogo ativado",
  catalog_deactivated: "Item de catálogo desativado",
  catalog_deleted: "Item de catálogo excluído",
};

export function AuditPage() {
  const { data, refresh } = useApp();
  const [search, setSearch] = useState("");
  const [actorId, setActorId] = useState("");
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const allEvents = [...data.events].sort(
    (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
  );
  const eventTypes = Object.keys(eventLabels);
  const events = filterAuditEvents(allEvents, data.profiles, { search, actorId, type, from, to });
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
      label: `Ação: ${eventLabels[type] ?? type}`,
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
            new Set(
              events.filter((event) => event.ticketId !== "system").map((event) => event.ticketId),
            ).size
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
      <section className="relative rounded-2xl border border-slate-100 bg-white shadow-soft">
        <div className="relative z-20 border-b border-slate-100 px-5 py-5 sm:px-7">
          <h2 className="font-display font-bold text-ink">Atividade recente</h2>
          <p className="mt-1 text-xs text-slate-400">
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
                      label: eventLabels[value] ?? value,
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
        <div className="divide-y divide-slate-100">
          {events.length ? (
            events.map((event) => {
              const actor = userById(data, event.actorId);
              const ticket = data.tickets.find((item) => item.id === event.ticketId);
              return (
                <div key={event.id} className="flex items-start gap-3 px-5 py-4 sm:px-7">
                  <Avatar user={actor} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-600">
                      <strong className="text-ink">{actor?.fullName ?? "Usuário removido"}</strong>{" "}
                      {event.detail}{" "}
                      {ticket && (
                        <Link
                          className="font-bold text-teal-700 hover:underline"
                          to={`/chamados/${ticket.id}`}
                        >
                          #{ticket.number}
                        </Link>
                      )}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {formatDate(event.createdAt, true)} · {eventLabels[event.type] ?? event.type}
                    </p>
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
      </section>
    </>
  );
}
