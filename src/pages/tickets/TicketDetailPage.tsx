import { useState } from "react";
import { Activity, ArrowLeft, BookOpen, CheckCircle2, Phone, X } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  SelectField,
  TicketPriorityBadge,
  TicketStatusBadge,
} from "../../components/ui";
import { useApp } from "../../context/AppContext";
import { categoryName, unitName, userById } from "../../lib/selectors";
import { useToast } from "../../context/useToast";
import { can, isStaff } from "../../lib/permissions";
import { formatDate, relativeDate } from "../../lib/utils";
import { statusMeta, type Profile, type TicketStatus } from "../../types";
import { TicketConversation } from "./TicketConversation";

export function TicketDetailPage() {
  const { id } = useParams();
  const { data, user, repo, refresh } = useApp();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const ticket = data.tickets.find((item) => item.id === id);
  const [resolution, setResolution] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);
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
  const assigned = userById(data, ticket.assignedTo);
  const requester = userById(data, ticket.createdBy);
  const canStaff = isStaff(user.role);
  const events = data.events
    .filter((item) => item.ticketId === ticket.id)
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  const statusChange = async (next: TicketStatus) => {
    try {
      await repo.changeStatus(ticket.id, next, next === "resolvido" ? resolution : undefined);
      await refresh();
      showToast(`Status alterado para ${statusMeta[next].label}.`);
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : "Não foi possível atualizar o status.";
      showToast(message, "error");
    }
  };
  return (
    <>
      <div className="mb-5">
        <button
          className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-teal-700"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft size={16} /> Voltar
        </button>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-bold text-slate-400">#{ticket.number}</span>
            <TicketStatusBadge status={ticket.status} />
            <TicketPriorityBadge priority={ticket.priorityId} data={data} />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            {ticket.title}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Aberto {formatDate(ticket.createdAt, true)} · Atualizado{" "}
            {relativeDate(ticket.updatedAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canStaff && !ticket.assignedTo && (
            <Button
              onClick={async () => {
                try {
                  await repo.claim(ticket.id);
                  await refresh();
                  showToast("Chamado assumido com sucesso.");
                } catch (reason) {
                  const message =
                    reason instanceof Error ? reason.message : "Não foi possível assumir.";
                  showToast(message, "error");
                }
              }}
            >
              <CheckCircle2 size={16} /> Assumir chamado
            </Button>
          )}
          {ticket.status === "resolvido" && user.role === "solicitante" && (
            <Button onClick={() => setConfirmClose(true)}>Confirmar encerramento</Button>
          )}
          {ticket.status === "resolvido" && (
            <Button variant="secondary" onClick={() => statusChange("em_andamento")}>
              Solicitar atendimento
            </Button>
          )}
        </div>
      </div>
      <div className="mt-7 grid gap-6 xl:grid-cols-[1fr_330px]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-soft sm:p-7">
            <div className="flex items-center justify-between border-b border-slate-100 pb-5">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                  <BookOpen size={17} />
                </span>
                <h2 className="font-display font-bold text-ink">Descrição do chamado</h2>
              </div>
              <Badge tone="slate">{categoryName(data, ticket.categoryId)}</Badge>
            </div>
            <p className="whitespace-pre-wrap pt-5 text-sm leading-7 text-slate-600">
              {ticket.description}
            </p>
            {ticket.resolutionNotes && (
              <div className="mt-5 rounded-xl bg-emerald-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-emerald-700">
                  Solução registrada
                </p>
                <p className="mt-2 text-sm leading-6 text-emerald-900">{ticket.resolutionNotes}</p>
              </div>
            )}
          </section>
          <TicketConversation ticket={ticket} />
        </div>
        <aside className="space-y-5">
          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-soft">
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
              <div className="mt-5 border-t border-slate-100 pt-5">
                {can(user.role, "manage_users") && (
                  <div className="mb-4">
                    <SelectField
                      label="Responsável"
                      value={ticket.assignedTo ?? ""}
                      onChange={async (value) => {
                        try {
                          await repo.assign(ticket.id, value);
                          await refresh();
                          showToast(
                            value
                              ? "Chamado atribuído com sucesso."
                              : "Chamado liberado para a fila.",
                          );
                        } catch (reason) {
                          const message =
                            reason instanceof Error
                              ? reason.message
                              : "Não foi possível atribuir o chamado.";
                          showToast(message, "error");
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
                    {ticket.assignedTo && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="mt-2 min-h-8 px-2 text-xs"
                        onClick={async () => {
                          try {
                            await repo.assign(ticket.id, "");
                            await refresh();
                            showToast("Chamado liberado para a fila.");
                          } catch (reason) {
                            const message =
                              reason instanceof Error
                                ? reason.message
                                : "Não foi possível liberar o chamado.";
                            showToast(message, "error");
                          }
                        }}
                      >
                        <X size={14} /> Remover responsável
                      </Button>
                    )}
                  </div>
                )}
                <div className="mb-4">
                  <SelectField
                    label="Prioridade"
                    value={ticket.priorityId}
                    onChange={async (value) => {
                      try {
                        await repo.updatePriority(ticket.id, value);
                        await refresh();
                        showToast("Prioridade atualizada.");
                      } catch (reason) {
                        const message =
                          reason instanceof Error
                            ? reason.message
                            : "Não foi possível atualizar a prioridade.";
                        showToast(message, "error");
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
                <SelectField
                  label="Alterar status"
                  value={ticket.status}
                  onChange={(value) => {
                    if (value === "resolvido" && !ticket.resolutionNotes) setResolution("");
                    statusChange(value as TicketStatus);
                  }}
                >
                  {Object.entries(statusMeta).map(([key, value]) => (
                    <option key={key} value={key}>
                      {value.label}
                    </option>
                  ))}
                </SelectField>
                {["em_andamento", "resolvido"].includes(ticket.status) && (
                  <textarea
                    value={resolution || ticket.resolutionNotes || ""}
                    onChange={(e) => setResolution(e.target.value)}
                    placeholder="Descreva a solução aplicada"
                    rows={3}
                    className="mt-3 w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-teal-600"
                  />
                )}
              </div>
            )}
          </section>
          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-soft">
            <div className="flex items-center justify-between">
              <h2 className="font-display font-bold text-ink">Histórico</h2>
              <Activity size={16} className="text-slate-400" />
            </div>
            <div className="mt-5 space-y-4">
              {events.map((event) => (
                <div key={event.id} className="relative flex gap-3">
                  <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-50 text-[10px] text-teal-700">
                    <CheckCircle2 size={12} />
                  </span>
                  <div>
                    <p className="text-xs font-semibold leading-5 text-slate-600">{event.detail}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {formatDate(event.createdAt, true)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
      <ConfirmDialog
        open={confirmClose}
        title="Confirmar encerramento"
        description="O chamado será marcado como fechado e sairá do acompanhamento ativo. Deseja continuar?"
        confirmLabel="Encerrar chamado"
        onCancel={() => setConfirmClose(false)}
        onConfirm={() => {
          setConfirmClose(false);
          statusChange("fechado");
        }}
      />
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
  avatar?: Profile;
  icon?: typeof Phone;
}) {
  return (
    <div className="flex items-center gap-3">
      {avatar ? (
        <Avatar user={avatar} size="sm" />
      ) : Icon ? (
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
          <Icon size={15} />
        </span>
      ) : (
        <span className="h-2 w-2 rounded-full bg-teal-600" />
      )}
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="truncate text-sm font-semibold text-ink">{value}</p>
      </div>
    </div>
  );
}
