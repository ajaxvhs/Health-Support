import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  LockKeyhole,
  Phone,
  X,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  SelectField,
  TicketPriorityBadge,
  TicketStatusBadge,
} from "../../components/ui";
import { useApp } from "../../context/AppContext";
import { categoryName, unitName, userById } from "../../lib/selectors";
import { useToast } from "../../context/useToast";
import { executeAction } from "../../lib/actionRunner";
import { can, isStaff } from "../../lib/permissions";
import {
  availableStatusTransitions,
  canReopenTicket,
  isTicketTerminal,
} from "../../lib/ticketPolicy";
import { errorMessage, formatDate, relativeDate, resolutionValueForTicket } from "../../lib/utils";
import { statusMeta, type Profile, type TicketParticipant, type TicketStatus } from "../../types";
import { TicketConversation } from "./TicketConversation";
import { queryCache } from "../../lib/queryCache";
import { SkeletonText, SyncIndicator } from "../../components/Skeleton";
import { useTicketRealtime } from "./useTicketRealtime";

export function TicketDetailPage() {
  const { id } = useParams();
  const { data, user, repo, refreshTicketNavigationCounts } = useApp();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const realtimeActive = useTicketRealtime(user.id, id);
  const ticketQueryKey = ["ticket-detail", user.id, id] as const;
  const ticketQuery = useQuery({
    queryKey: ticketQueryKey,
    queryFn: () => repo.getTicketById(id!),
    enabled: Boolean(id),
    refetchInterval: realtimeActive ? false : queryCache.ticketRefreshInterval,
    refetchIntervalInBackground: false,
    ...queryCache.ticketDetail,
  });
  const ticketEventsQuery = useQuery({
    queryKey: ["ticket-events", user.id, id],
    queryFn: () => repo.getTicketEvents(id!),
    enabled: Boolean(id),
    refetchInterval: realtimeActive ? false : queryCache.ticketRefreshInterval,
    refetchIntervalInBackground: false,
    ...queryCache.ticketDetail,
  });
  const ticket = ticketQuery.data ?? null;
  const ticketEvents = ticketEventsQuery.data ?? [];
  const [resolutionDraft, setResolutionDraft] = useState<{
    ticketId: string;
    value: string;
  } | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [resolving, setResolving] = useState(false);
  const invalidateTicketQueries = () => {
    void queryClient.invalidateQueries({ queryKey: ["ticket-pages", user.id] });
    void queryClient.invalidateQueries({ queryKey: ["ticket-dashboard", user.id] });
    void queryClient.invalidateQueries({ queryKey: ["audit-pages", user.id] });
    void queryClient.invalidateQueries({ queryKey: ["ticket-events", user.id, id] });
  };
  useEffect(() => {
    if (ticketQuery.error)
      showToast(errorMessage(ticketQuery.error, "Não foi possível carregar o chamado."), "error");
  }, [showToast, ticketQuery.error]);
  useEffect(() => {
    if (ticketEventsQuery.error)
      showToast(
        errorMessage(ticketEventsQuery.error, "Não foi possível carregar o histórico."),
        "error",
      );
  }, [showToast, ticketEventsQuery.error]);
  if (ticketQuery.isLoading)
    return (
      <TicketDetailLoading staff={isStaff(user.role)} canManage={can(user.role, "manage_users")} />
    );
  if (!ticket)
    return (
      <EmptyState
        title="Chamado não encontrado"
        text="O chamado pode ter sido removido ou o endereço está incorreto."
        action={
          <Link to="/chamados">
            <Button>Voltar aos chamados</Button>
          </Link>
        }
      />
    );
  if (user.role === "solicitante" && ticket.createdBy !== user.id)
    return (
      <EmptyState
        title="Acesso negado"
        text="Você não tem permissão para visualizar este chamado."
        action={
          <Link to="/chamados">
            <Button>Voltar aos chamados</Button>
          </Link>
        }
      />
    );
  const resolution = resolutionValueForTicket(ticket.id, ticket.resolutionNotes, resolutionDraft);
  const assigned = userById(data, ticket.assignedTo);
  const requester = userById(data, ticket.createdBy);
  const canStaff = isStaff(user.role);
  const terminal = isTicketTerminal(ticket);
  const canResolve =
    Boolean(ticket.assignedTo) && (user.role === "admin" || ticket.assignedTo === user.id);
  const statusOptions = availableStatusTransitions(user, ticket);
  const events = ticketEvents
    .filter((item) => item.ticketId === ticket.id)
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  const statusChange = async (next: TicketStatus) => {
    const result = await executeAction(
      () =>
        next === "aberto" && !terminal
          ? repo.assign(ticket.id, "")
          : repo.changeStatus(ticket.id, next, next === "resolvido" ? resolution : undefined),
      { fallback: "Não foi possível atualizar o status.", showToast },
    );
    if (!result.ok) return false;
    const updated = result.value;
    queryClient.setQueryData(ticketQueryKey, updated);
    invalidateTicketQueries();
    void refreshTicketNavigationCounts();
    const successMessage =
      next === "resolvido"
        ? "Chamado resolvido com sucesso."
        : next === "fechado"
          ? "Chamado encerrado com sucesso."
          : `Status alterado para ${statusMeta[next].label}.`;
    showToast(successMessage);
    if ((next === "resolvido" || next === "fechado") && isStaff(user.role)) {
      navigate("/chamados?visao=fila", { replace: true });
    }
    return true;
  };
  const submitResolution = (event: FormEvent) => {
    event.preventDefault();
    if (!resolution.trim() || resolving) return;
    setResolving(true);
    void statusChange("resolvido").finally(() => setResolving(false));
  };
  return (
    <>
      <div className="mb-5">
        <button
          className="inline-flex items-center gap-2 text-sm font-bold text-muted hover:text-brand"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft size={16} /> Voltar
        </button>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold text-subtle">#{ticket.number}</span>
            <TicketStatusBadge status={ticket.status} />
            <TicketPriorityBadge priority={ticket.priorityId} data={data} />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            {ticket.title}
          </h1>
          <p className="mt-2 text-sm text-muted">
            Aberto {formatDate(ticket.createdAt, true)} · Atualizado{" "}
            {relativeDate(ticket.updatedAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canStaff && ticket.status === "aberto" && !ticket.assignedTo && (
            <Button
              loading={claiming}
              aria-busy={claiming}
              onClick={async () => {
                const result = await executeAction(() => repo.claim(ticket.id), {
                  fallback: "Não foi possível assumir.",
                  showToast,
                  setPending: setClaiming,
                });
                if (!result.ok) return;
                queryClient.setQueryData(ticketQueryKey, result.value);
                invalidateTicketQueries();
                void refreshTicketNavigationCounts();
                showToast("Chamado assumido com sucesso.");
              }}
            >
              {!claiming && <CheckCircle2 size={16} aria-hidden="true" />}
              Assumir chamado
            </Button>
          )}
          {terminal && canReopenTicket(user, ticket) && (
            <Button variant="secondary" onClick={() => statusChange("aberto")}>
              Reabrir chamado
            </Button>
          )}
        </div>
      </div>
      <div className="mt-7 grid gap-6 xl:grid-cols-[1fr_330px]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-line-soft bg-surface p-5 shadow-soft sm:p-7">
            <div className="flex items-center justify-between border-b border-line-soft pb-5">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-muted text-secondary">
                  <BookOpen size={17} />
                </span>
                <h2 className="font-display font-bold text-ink">Descrição do chamado</h2>
              </div>
              <Badge tone="slate">{categoryName(data, ticket.categoryId)}</Badge>
            </div>
            <p className="whitespace-pre-wrap pt-5 text-sm leading-7 text-secondary">
              {ticket.description}
            </p>
          </section>
          {ticket.resolutionNotes && (
            <section
              aria-labelledby="ticket-resolution-title"
              className="rounded-2xl border border-success/20 bg-success-soft/40 p-5 shadow-soft sm:p-7"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success-soft text-success-strong">
                  <CheckCircle2 size={20} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2
                      id="ticket-resolution-title"
                      className="font-display font-bold text-success-strong"
                    >
                      Solução registrada
                    </h2>
                    {ticket.resolvedAt && (
                      <span className="text-xs text-success-strong">
                        Resolvido em {formatDate(ticket.resolvedAt, true)}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-success-strong/80">
                    Resposta compartilhada com o solicitante
                  </p>
                  <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-ink">
                    {ticket.resolutionNotes}
                  </p>
                </div>
              </div>
            </section>
          )}
          {canStaff && ticket.status === "em_andamento" && canResolve && (
            <section className="overflow-hidden rounded-2xl border border-line-soft bg-surface shadow-soft">
              <div className="flex items-start gap-3 border-b border-line-soft bg-surface-soft/70 p-5 sm:p-6">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                  <CheckCircle2 size={20} aria-hidden="true" />
                </span>
                <div>
                  <h2 className="font-display font-bold text-ink">
                    Como o problema foi resolvido?
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-secondary">
                    Registre os passos realizados e o resultado. Este resumo ficará visível ao
                    solicitante.
                  </p>
                </div>
              </div>
              <form onSubmit={submitResolution} className="p-5 sm:p-6">
                <label
                  htmlFor="ticket-resolution-draft"
                  className="mb-2 block text-sm font-semibold text-ink"
                >
                  Resumo da solução <span className="text-danger-strong">*</span>
                </label>
                <textarea
                  id="ticket-resolution-draft"
                  value={resolution}
                  onChange={(event) =>
                    setResolutionDraft({ ticketId: ticket.id, value: event.target.value })
                  }
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      if (!resolving) event.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder="Ex.: Ajustei as permissões da conta e confirmei o acesso com o solicitante."
                  rows={5}
                  required
                  className="w-full resize-y rounded-xl border border-line bg-surface p-3 text-sm leading-6 text-ink outline-none placeholder:text-subtle focus:border-brand-focus focus:ring-2 focus:ring-brand-muted"
                />
                <div className="mt-4 flex flex-col gap-3 border-t border-line-soft pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs leading-5 text-muted">
                    O chamado sairá da fila ativa. Você poderá reabri-lo se precisar continuar o
                    atendimento.
                  </p>
                  <Button
                    type="submit"
                    className="w-full shrink-0 sm:w-auto"
                    disabled={!resolution.trim() || resolving}
                    loading={resolving}
                    aria-busy={resolving}
                  >
                    {!resolving && <CheckCircle2 size={16} aria-hidden="true" />}
                    Marcar como resolvido
                  </Button>
                </div>
              </form>
            </section>
          )}
          <TicketConversation ticket={ticket} realtimeActive={realtimeActive} />
        </div>
        <aside className="space-y-5">
          <section className="rounded-2xl border border-line-soft bg-surface p-5 shadow-soft">
            <h2 className="font-display font-bold text-ink">Detalhes</h2>
            <div className="mt-5 space-y-4">
              <DetailItem label="Solicitante" value={ticket.requesterName} avatar={requester} />
              <DetailItem label="Unidade" value={unitName(data, ticket.unitId)} />
              <DetailItem
                label="Responsável"
                value={assigned?.fullName ?? "Ainda não atribuído"}
                avatar={assigned}
              />
              <DetailItem
                label="Contato"
                value={canStaff ? ticket.requesterPhone : "Disponível para a equipe"}
                icon={Phone}
              />
            </div>
            {canStaff && (
              <div className="mt-5 border-t border-line-soft pt-5">
                {can(user.role, "manage_users") && !terminal && (
                  <div className="mb-4">
                    <SelectField
                      label="Responsável"
                      value={ticket.assignedTo ?? ""}
                      onChange={async (value) => {
                        const result = await executeAction(() => repo.assign(ticket.id, value), {
                          fallback: "Não foi possível atribuir o chamado.",
                          showToast,
                        });
                        if (!result.ok) return;
                        queryClient.setQueryData(ticketQueryKey, result.value);
                        invalidateTicketQueries();
                        void refreshTicketNavigationCounts();
                        showToast(
                          value
                            ? "Chamado atribuído com sucesso."
                            : "Chamado liberado para a fila.",
                        );
                      }}
                    >
                      <option value="">Sem responsável</option>
                      {data.profiles
                        .filter((profile) => profile.isActive && profile.role !== "solicitante")
                        .map((profile) => (
                          <option key={profile.id} value={profile.id}>
                            {profile.fullName}
                          </option>
                        ))}
                    </SelectField>
                    {ticket.assignedTo && !terminal && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="mt-2 min-h-8 px-2 text-xs"
                        onClick={async () => {
                          const result = await executeAction(() => repo.assign(ticket.id, ""), {
                            fallback: "Não foi possível liberar o chamado.",
                            showToast,
                          });
                          if (!result.ok) return;
                          queryClient.setQueryData(ticketQueryKey, result.value);
                          invalidateTicketQueries();
                          void refreshTicketNavigationCounts();
                          showToast("Chamado liberado para a fila.");
                        }}
                      >
                        <X size={14} /> Remover responsável
                      </Button>
                    )}
                  </div>
                )}
                {!terminal && (
                  <div className="mb-4">
                    <SelectField
                      label="Prioridade"
                      value={ticket.priorityId}
                      onChange={async (value) => {
                        const result = await executeAction(
                          () => repo.updatePriority(ticket.id, value),
                          { fallback: "Não foi possível atualizar a prioridade.", showToast },
                        );
                        if (!result.ok) return;
                        queryClient.setQueryData(ticketQueryKey, result.value);
                        invalidateTicketQueries();
                        void refreshTicketNavigationCounts();
                        showToast("Prioridade atualizada.");
                      }}
                    >
                      {data.priorities
                        .filter((item) => item.isActive)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                    </SelectField>
                  </div>
                )}
                {!terminal && statusOptions.length > 0 && (
                  <SelectField
                    label="Alterar status"
                    value={ticket.status}
                    onChange={(value) => statusChange(value as TicketStatus)}
                  >
                    <option value={ticket.status}>{statusMeta[ticket.status].label}</option>
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>
                        {status === "fechado" ? "Fechado sem resolução" : statusMeta[status].label}
                      </option>
                    ))}
                  </SelectField>
                )}
                {terminal && (
                  <div className="rounded-xl border border-line-soft bg-surface-soft/70 p-3">
                    <div className="flex items-start gap-2.5">
                      <LockKeyhole
                        size={16}
                        className="mt-0.5 shrink-0 text-subtle"
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">Chamado finalizado</p>
                        <p className="mt-1 text-xs leading-5 text-secondary">
                          Mensagens e alterações de responsável estão bloqueadas.
                        </p>
                        <p className="mt-2 text-xs leading-5 text-muted">
                          {canReopenTicket(user, ticket)
                            ? "Você pode reabrir este chamado."
                            : "Somente um administrador pode reabri-lo."}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
          <section className="rounded-2xl border border-line-soft bg-surface p-5 shadow-soft">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-ink">Histórico</h2>
              <div className="flex items-center gap-3">
                <SyncIndicator
                  active={
                    (ticketQuery.isFetching || ticketEventsQuery.isFetching) &&
                    !ticketQuery.isLoading
                  }
                />
                <Activity size={16} className="text-subtle" />
              </div>
            </div>
            <div
              aria-label="Eventos do chamado"
              aria-busy={ticketEventsQuery.isLoading}
              className="mt-5 max-h-96 space-y-4 overflow-y-auto overscroll-contain pr-2 sm:max-h-[32rem]"
              tabIndex={0}
            >
              {ticketEventsQuery.isLoading ? (
                <div role="status" aria-label="Carregando histórico do chamado">
                  <TicketHistorySkeleton />
                </div>
              ) : events.length ? (
                events.map((event) => {
                  const actor = userById(data, event.actorId);
                  return (
                    <div key={event.id} className="relative flex gap-3">
                      <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[10px] text-brand">
                        <CheckCircle2 size={12} />
                      </span>
                      <div>
                        <p className="text-xs font-semibold leading-5 text-secondary">
                          {event.detail}
                        </p>
                        <p className="mt-0.5 text-[10px] text-subtle">
                          {actor ? `Por ${actor.fullName} · ` : ""}
                          {formatDate(event.createdAt, true)}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="py-5 text-center text-sm text-subtle">
                  Nenhum evento registrado neste chamado.
                </p>
              )}
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}

function DetailItem({
  label,
  value,
  avatar,
  icon: Icon,
}: {
  label: string;
  value: string;
  avatar?: Profile | TicketParticipant;
  icon?: typeof Phone;
}) {
  return (
    <div className="flex items-center gap-3">
      {avatar ? (
        <Avatar user={avatar} size="sm" />
      ) : Icon ? (
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-muted text-muted">
          <Icon size={15} />
        </span>
      ) : (
        <span className="h-2 w-2 rounded-full bg-brand" />
      )}
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wide text-subtle">{label}</p>
        <p className="truncate text-sm font-semibold text-ink">{value}</p>
      </div>
    </div>
  );
}

export function TicketDetailLoading({
  staff = true,
  canManage = true,
}: {
  staff?: boolean;
  canManage?: boolean;
}) {
  return (
    <div role="status" aria-busy="true" aria-label="Carregando chamado">
      <div className="mb-5">
        <button className="inline-flex items-center gap-2 text-sm font-bold text-muted">
          <ArrowLeft size={16} /> Voltar
        </button>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2" aria-hidden="true">
            <SkeletonText className="h-4 w-10" />
            <SkeletonText className="h-6 w-20 rounded-full" />
            <SkeletonText className="h-6 w-24 rounded-full" />
          </div>
          <SkeletonText className="h-8 w-2/3 max-w-xl sm:h-9" />
          <div className="mt-2 flex items-center gap-2" aria-hidden="true">
            <SkeletonText className="h-4 w-36" />
            <SkeletonText className="h-4 w-32" />
          </div>
        </div>
        {staff && (
          <Button>
            <CheckCircle2 size={16} aria-hidden="true" /> Assumir chamado
          </Button>
        )}
      </div>
      <div className="mt-7 grid gap-6 xl:grid-cols-[1fr_330px]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-line-soft bg-surface p-5 shadow-soft sm:p-7">
            <div className="flex items-center justify-between border-b border-line-soft pb-5">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-surface-muted text-secondary">
                  <BookOpen size={17} />
                </span>
                <h2 className="font-display font-bold text-ink">Descrição do chamado</h2>
              </div>
              <span className="inline-flex h-7 items-center rounded-full bg-surface-muted px-2.5">
                <SkeletonText className="h-3 w-20" />
              </span>
            </div>
            <div className="space-y-3 pt-5" aria-hidden="true">
              <SkeletonText className="h-4 w-full" />
              <SkeletonText className="h-4 w-full" />
              <SkeletonText className="h-4 w-4/5" />
            </div>
          </section>
          <section className="rounded-2xl border border-line-soft bg-surface shadow-soft">
            <div className="border-b border-line-soft px-5 py-5 sm:px-7">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-display font-bold text-ink">Conversa do chamado</h2>
              </div>
              <p className="mt-1 text-xs text-subtle">
                Mensagens públicas e atualizações do atendimento
              </p>
            </div>
            <div
              className="max-h-96 space-y-5 overflow-y-auto overscroll-contain p-5 sm:max-h-[32rem] sm:p-7"
              aria-hidden="true"
            >
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="flex gap-3">
                  <SkeletonText className="h-8 w-8 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-2">
                      <SkeletonText className="h-4 w-28" />
                      <SkeletonText className="h-3 w-20" />
                    </div>
                    <SkeletonText className="mt-2 h-4 w-full max-w-2xl" />
                    <SkeletonText className="mt-2 h-4 w-4/5 max-w-xl" />
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-line-soft bg-surface-soft/60 p-5 sm:p-7">
              <div className="h-28 rounded-xl border border-line bg-surface" aria-hidden="true" />
              <div className="mt-4 flex justify-end">
                <Button disabled>Enviar mensagem</Button>
              </div>
            </div>
          </section>
        </div>
        <aside className="space-y-5">
          <section className="rounded-2xl border border-line-soft bg-surface p-5 shadow-soft">
            <h2 className="font-display font-bold text-ink">Detalhes</h2>
            <div className="mt-5 space-y-4">
              <DetailItemLoading label="Solicitante" kind="avatar" />
              <DetailItemLoading label="Unidade" />
              <DetailItemLoading label="Responsável" kind="avatar" />
              <DetailItemLoading label="Contato" kind="phone" />
            </div>
            {staff && (
              <div className="mt-5 space-y-4 border-t border-line-soft pt-5">
                {canManage && <SelectItemLoading label="Responsável" />}
                <SelectItemLoading label="Prioridade" />
                <SelectItemLoading label="Alterar status" />
              </div>
            )}
          </section>
          <section className="rounded-2xl border border-line-soft bg-surface p-5 shadow-soft">
            <h2 className="font-display font-bold text-ink">Histórico</h2>
            <div
              className="mt-5 max-h-96 space-y-4 overflow-y-auto overscroll-contain pr-2 sm:max-h-[32rem]"
              aria-hidden="true"
            >
              <TicketHistorySkeleton />
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function DetailItemLoading({
  label,
  kind = "dot",
}: {
  label: string;
  kind?: "dot" | "avatar" | "phone";
}) {
  return (
    <div className="flex items-center gap-3" aria-hidden="true">
      {kind === "avatar" ? (
        <SkeletonText className="h-8 w-8 shrink-0 rounded-lg" />
      ) : kind === "phone" ? (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-muted">
          <Phone size={15} />
        </span>
      ) : (
        <span className="h-2 w-2 shrink-0 rounded-full bg-brand" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wide text-subtle">{label}</p>
        <SkeletonText className="mt-1 h-4 w-3/4" />
      </div>
    </div>
  );
}

function SelectItemLoading({ label }: { label: string }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-muted">{label}</p>
      <div className="flex min-h-12 items-center justify-between rounded-xl border border-line bg-surface px-3.5">
        <SkeletonText className="h-4 w-28" />
        <ChevronDown size={16} className="shrink-0 text-muted" />
      </div>
    </div>
  );
}

function TicketHistorySkeleton() {
  return (
    <div className="space-y-4" aria-hidden="true">
      {Array.from({ length: 3 }, (_, index) => (
        <div key={index} className="relative flex gap-3">
          <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[10px] text-brand">
            <CheckCircle2 size={12} />
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonText className="h-3 w-full max-w-64" />
            <SkeletonText className="h-3 w-28" />
          </div>
        </div>
      ))}
    </div>
  );
}
