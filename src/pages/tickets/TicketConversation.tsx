import { useState, type FormEvent } from "react";
import { Check, Send } from "lucide-react";
import { Avatar, Badge, Button } from "../../components/ui";
import { useApp } from "../../context/AppContext";
import { useToast } from "../../context/useToast";
import { isStaff } from "../../lib/permissions";
import { userById } from "../../lib/selectors";
import { cn, formatDate } from "../../lib/utils";
import type { Ticket } from "../../types";

export function TicketConversation({ ticket }: { ticket: Ticket }) {
  const { data, user, repo, refresh } = useApp();
  const { showToast } = useToast();
  const [message, setMessage] = useState("");
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const canStaff = isStaff(user.role);
  const messages = data.messages.filter(
    (item) => item.ticketId === ticket.id && (canStaff || !item.isInternal),
  );

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    if (!message.trim()) {
      showToast("Escreva uma mensagem antes de enviar.", "error");
      return;
    }
    setSending(true);
    try {
      await repo.addMessage(ticket.id, message, internal);
      setMessage("");
      await refresh();
      showToast(internal ? "Nota interna adicionada." : "Mensagem enviada.");
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : "Não foi possível enviar.", "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-100 bg-white shadow-soft">
      <div className="border-b border-slate-100 px-5 py-5 sm:px-7">
        <h2 className="font-display font-bold text-ink">Conversa do chamado</h2>
        <p className="mt-1 text-xs text-slate-400">
          Mensagens públicas e atualizações do atendimento
        </p>
      </div>
      <div className="max-h-96 space-y-5 overflow-y-auto p-5 sm:max-h-[32rem] sm:p-7">
        {messages.length ? (
          messages.map((item) => {
            const sender = userById(data, item.senderId);
            return (
              <div
                key={item.id}
                className={
                  item.isInternal
                    ? "rounded-xl border border-amber-200 bg-amber-50 p-4"
                    : "flex gap-3"
                }
              >
                {!item.isInternal && <Avatar user={sender} size="sm" />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <strong className="text-sm text-ink">{sender?.fullName ?? "Usuário"}</strong>
                    {item.isInternal && <Badge tone="amber">Nota interna</Badge>}
                    <span className="text-[11px] text-slate-400">
                      {formatDate(item.createdAt, true)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{item.message}</p>
                </div>
              </div>
            );
          })
        ) : (
          <p className="py-5 text-center text-sm text-slate-400">Nenhuma mensagem neste chamado.</p>
        )}
      </div>
      <form onSubmit={sendMessage} className="border-t border-slate-100 bg-slate-50/60 p-5 sm:p-7">
        <div className="block">
          <span className="mb-2 block text-sm font-bold text-ink">Adicionar mensagem</span>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={3}
            aria-label="Adicionar mensagem"
            placeholder={
              internal
                ? "Escreva uma nota visível apenas para a equipe..."
                : "Escreva uma resposta para este chamado..."
            }
            className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
          />
        </div>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {canStaff && (
            <label
              className={cn(
                "group flex min-h-10 cursor-pointer select-none items-center gap-2 rounded-xl px-4 text-xs font-bold transition-colors",
                internal ? "bg-teal-50 text-teal-800" : "text-slate-600 hover:bg-slate-100",
              )}
            >
              <input
                type="checkbox"
                aria-label="Nota interna (somente equipe)"
                checked={internal}
                onChange={(event) => setInternal(event.target.checked)}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className={cn(
                  "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-teal-500 peer-focus-visible:ring-offset-2",
                  internal
                    ? "border-teal-700 bg-teal-700 text-white"
                    : "border-slate-300 bg-white group-hover:border-teal-400",
                )}
              >
                {internal && <Check size={14} strokeWidth={3} />}
              </span>
              <span>Nota interna (somente equipe)</span>
            </label>
          )}
          <Button className="sm:ml-auto" loading={sending}>
            <Send size={15} /> Enviar mensagem
          </Button>
        </div>
      </form>
    </section>
  );
}
