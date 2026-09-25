import { useState, type FormEvent } from "react";
import { Activity, ArrowLeft, BookOpen, CheckCircle2, LockKeyhole, Phone, X } from "lucide-react";
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
import { can, isStaff } from "../../lib/permissions";
import {
  availableStatusTransitions,
  canReopenTicket,
  isTicketTerminal,
} from "../../lib/ticketPolicy";
import {
  errorMessage,
  formatDate,
  refreshAndNotify,
  relativeDate,
  resolutionValueForTicket,
} from "../../lib/utils";
import { statusMeta, type Profile, type TicketParticipant, type TicketStatus } from "../../types";
import { TicketConversation } from "./TicketConversation";

export function TicketDetailPage() {
  const { id } = useParams();
  const { data, user, repo, refresh, mergeTicket } = useApp();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const ticket = data.tickets.find((item) => item.id === id);
  const [resolutionDraft, setResolutionDraft] = useState<{
    ticketId: string;
    value: string;
  } | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [resolving, setResolving] = useState(false);
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
  const events = data.events
    .filter((item) => item.ticketId === ticket.id)
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  const statusChange = async (next: TicketStatus) => {
    try {
      const updated =
        next === "aberto" && !terminal
          ? await repo.assign(ticket.id, "")
          : await repo.changeStatus(ticket.id, next, next === "resolvido" ? resolution : undefined);
      mergeTicket(updated);
      const successMessage =
        next === "resolvido"
          ? "Chamado resolvido com sucesso."
          : next === "fechado"
            ? "Chamado encerrado com sucesso."
            : `Status alterado para ${statusMeta[next].label}.`;
      await refreshAndNotify(refresh, showToast, successMessage);
      if ((next === "resolvido" || next === "fechado") && isStaff(user.role)) {
        navigate("/chamados?visao=fila", { replace: true });
      }
    } catch (reason) {
      showToast(errorMessage(reason, "Não foi possível atualizar o status."), "error");
    }
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
                setClaiming(true);
                try {
                  const updated = await repo.claim(ticket.id);
                  mergeTicket(updated);
                  await refreshAndNotify(refresh, showToast, "Chamado assumido com sucesso.");
                } catch (reason) {
                  showToast(errorMessage(reason, "Não foi possível assumir."), "error");
                } finally {
                  setClaiming(false);
                }
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
          <TicketConversation ticket={ticket} />
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
                        try {
                          const updated = await repo.assign(ticket.id, value);
                          mergeTicket(updated);
                          const actionMessage = value
                            ? "Chamado atribuído com sucesso."
                            : "Chamado liberado para a fila.";
                          await refreshAndNotify(refresh, showToast, actionMessage);
                        } catch (reason) {
                          showToast(
                            errorMessage(reason, "Não foi possível atribuir o chamado."),
                            "error",
                          );
                        }
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
                          try {
                            const updated = await repo.assign(ticket.id, "");
                            mergeTicket(updated);
                            await refreshAndNotify(
                              refresh,
                              showToast,
                              "Chamado liberado para a fila.",
                            );
                          } catch (reason) {
                            showToast(
                              errorMessage(reason, "Não foi possível liberar o chamado."),
                              "error",
                            );
                          }
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
                        try {
                          const updated = await repo.updatePriority(ticket.id, value);
                          mergeTicket(updated);
                          await refreshAndNotify(refresh, showToast, "Prioridade atualizada.");
                        } catch (reason) {
                          showToast(
                            errorMessage(reason, "Não foi possível atualizar a prioridade."),
                            "error",
                          );
                        }
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
              <Activity size={16} className="text-subtle" />
            </div>
            <div
              aria-label="Eventos do chamado"
              className="mt-5 max-h-96 space-y-4 overflow-y-auto overscroll-contain pr-2 sm:max-h-[32rem]"
              tabIndex={0}
            >
              {events.length ? (
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
