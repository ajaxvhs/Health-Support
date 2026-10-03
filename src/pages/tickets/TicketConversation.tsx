import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, LoaderCircle, Send } from "lucide-react";
import { Avatar, Badge, Button } from "../../components/ui";
import { useApp } from "../../context/AppContext";
import { useToast } from "../../context/useToast";
import { isStaff } from "../../lib/permissions";
import { userById } from "../../lib/selectors";
import { isTicketTerminal } from "../../lib/ticketPolicy";
import { cn, errorMessage, formatDate } from "../../lib/utils";
import type { Ticket, TicketMessage } from "../../types";
import { queryCache } from "../../lib/queryCache";
import { runPwaScopeMutation } from "../../lib/pwaUpdate";
import { SkeletonText, SyncIndicator } from "../../components/Skeleton";

export function TicketConversation({
  ticket,
  realtimeActive,
}: {
  ticket: Ticket;
  realtimeActive: boolean;
}) {
  const { data, user, repo } = useApp();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [message, setMessage] = useState("");
  const [internal, setInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const messageFormRef = useRef<HTMLFormElement>(null);
  const messagesQuery = useQuery({
    queryKey: ["ticket-messages", user.id, ticket.id],
    queryFn: () => repo.getTicketMessages(ticket.id),
    refetchInterval: realtimeActive ? false : queryCache.ticketRefreshInterval,
    refetchIntervalInBackground: false,
    ...queryCache.ticketDetail,
  });
  const ticketMessages = messagesQuery.data ?? [];
  useEffect(() => {
    if (messagesQuery.error)
      showToast(
        errorMessage(messagesQuery.error, "Não foi possível carregar as mensagens."),
        "error",
      );
  }, [messagesQuery.error, showToast]);
  const canStaff = isStaff(user.role);
  const terminal = isTicketTerminal(ticket);
  const messages = ticketMessages.filter(
    (item) => item.ticketId === ticket.id && (canStaff || !item.isInternal),
  );

  const sendMessage = async () => {
    if (!message.trim()) {
      showToast("Escreva uma mensagem antes de enviar.", "error");
      return;
    }
    const form = messageFormRef.current;
    if (!form) return;
    const submittedMessage = message;
    setSending(true);
    try {
      const { value: sent, saved } = await runPwaScopeMutation(form, () =>
        repo.addMessage(ticket.id, submittedMessage, internal),
      );
      queryClient.setQueryData<TicketMessage[]>(
        ["ticket-messages", user.id, ticket.id],
        (items = []) => [...items.filter((item) => item.id !== sent.id), sent],
      );
      if (!internal)
        void queryClient.invalidateQueries({ queryKey: ["ticket-dashboard", user.id] });
      if (saved) setMessage("");
      const actionLabel = internal ? "Nota interna adicionada." : "Mensagem enviada.";
      showToast(actionLabel);
    } catch (reason) {
      showToast(errorMessage(reason, "Não foi possível enviar."), "error");
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void sendMessage();
  };

  return (
    <section className="rounded-2xl border border-line-soft bg-surface shadow-soft">
      <div className="border-b border-line-soft px-5 py-5 sm:px-7">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display font-bold text-ink">Conversa do chamado</h2>
          <SyncIndicator active={messagesQuery.isFetching && !messagesQuery.isLoading} />
        </div>
        <p className="mt-1 text-xs text-subtle">Mensagens públicas e atualizações do atendimento</p>
      </div>
      <div
        className="max-h-96 space-y-5 overflow-y-auto overscroll-contain p-5 sm:max-h-[32rem] sm:p-7"
        aria-busy={messagesQuery.isLoading}
      >
        {messagesQuery.isLoading ? (
          <div role="status" aria-busy="true" aria-label="Carregando conversa">
            <div className="space-y-5">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={index} className="flex gap-3" aria-hidden="true">
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
          </div>
        ) : messages.length ? (
          messages.map((item) => {
            const sender = userById(data, item.senderId);
            return (
              <div
                key={item.id}
                className={
                  item.isInternal
                    ? "rounded-xl border border-caution-border bg-caution-soft p-4"
                    : "flex gap-3"
                }
              >
                {!item.isInternal && <Avatar user={sender} size="sm" />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <strong className="text-sm text-ink">{sender?.fullName ?? "Usuário"}</strong>
                    {item.isInternal && <Badge tone="amber">Nota interna</Badge>}
                    <span className="text-[11px] text-subtle">
                      {formatDate(item.createdAt, true)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-secondary">{item.message}</p>
                </div>
              </div>
            );
          })
        ) : (
          <p className="py-5 text-center text-sm text-subtle">Nenhuma mensagem neste chamado.</p>
        )}
      </div>
      {!terminal && (
        <form
          ref={messageFormRef}
          onSubmit={handleSubmit}
          className="border-t border-line-soft bg-surface-soft/60 p-5 sm:p-7"
        >
          <div className="block">
            <span className="mb-2 block text-sm font-bold text-ink">Adicionar mensagem</span>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  if (!sending) void sendMessage();
                }
              }}
              rows={3}
              aria-label="Adicionar mensagem"
              placeholder={
                internal
                  ? "Escreva uma nota visível apenas para a equipe..."
                  : "Escreva uma resposta para este chamado..."
              }
              className="w-full resize-none rounded-xl border border-line bg-surface px-3.5 py-3 text-sm outline-none focus:border-brand-focus focus:ring-2 focus:ring-brand-muted"
            />
          </div>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {canStaff && (
              <label
                className={cn(
                  "group flex min-h-10 cursor-pointer select-none items-center gap-2 rounded-xl px-4 text-xs font-bold transition-colors",
                  internal
                    ? "bg-brand-soft text-brand-contrast"
                    : "text-secondary hover:bg-surface-muted",
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
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2",
                    internal
                      ? "border-brand-strong bg-brand-strong text-on-brand"
                      : "border-line-strong bg-surface group-hover:border-brand-hover",
                  )}
                >
                  {internal && <Check size={14} strokeWidth={3} />}
                </span>
                <span>Nota interna (somente equipe)</span>
              </label>
            )}
            <Button className="sm:ml-auto" disabled={sending} aria-busy={sending}>
              {sending ? (
                <LoaderCircle size={15} className="shrink-0 animate-spin" aria-hidden="true" />
              ) : (
                <Send size={15} aria-hidden="true" />
              )}
              Enviar mensagem
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
