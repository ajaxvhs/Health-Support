import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  MessageCircle,
  Plus,
  Sparkles,
  Ticket as TicketIcon,
  UserCheck,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button, EmptyState, PageHeader, StatCard } from "../../components/ui";
import { useApp } from "../../context/AppContext";
import { isStaff } from "../../lib/permissions";
import { averageFirstPublicStaffResponseMinutes, formatResponseTime } from "../../lib/utils";
import { TicketRow } from "../tickets/TicketRow";

export function DashboardPage() {
  const { data, user } = useApp();
  const staff = isStaff(user.role);
  const mine = staff ? data.tickets : data.tickets.filter((ticket) => ticket.createdBy === user.id);
  const open = mine.filter((t) => t.status !== "fechado");
  const urgentPriority = data.priorities.find((priority) => priority.slug === "urgente");
  const urgent = mine.filter(
    (ticket) => ticket.priorityId === urgentPriority?.id && ticket.status !== "fechado",
  );
  const waitingForRequester = mine.filter((ticket) => {
    if (ticket.status === "fechado") return false;
    const latestPublicMessage = data.messages
      .filter((message) => message.ticketId === ticket.id && !message.isInternal)
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
    const sender = data.profiles.find((profile) => profile.id === latestPublicMessage?.senderId);
    return sender?.role !== "solicitante" && Boolean(latestPublicMessage);
  });
  const averageResponseMinutes = averageFirstPublicStaffResponseMinutes(
    mine,
    data.messages,
    data.profiles,
  );
  const delayedTickets =
    staff && averageResponseMinutes !== null
      ? mine.filter((ticket) => {
          if (ticket.status === "fechado") return false;
          const publicMessages = data.messages
            .filter((message) => message.ticketId === ticket.id && !message.isInternal)
            .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
          const lastMessage = publicMessages[publicMessages.length - 1];
          const sender = data.profiles.find((profile) => profile.id === lastMessage?.senderId);
          const waitingForStaff = !lastMessage || sender?.role === "solicitante";
          const waitingSince = lastMessage?.createdAt ?? ticket.createdAt;
          return (
            waitingForStaff &&
            Date.now() - new Date(waitingSince).getTime() > averageResponseMinutes * 60000
          );
        })
      : [];
  const recent = [...mine]
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
    .slice(0, 5);
  const averageResponse = formatResponseTime(averageResponseMinutes);
  return (
    <>
      <PageHeader
        eyebrow="Início"
        title={`Olá, ${user.fullName.split(" ")[0]}`}
        description={
          !staff
            ? "Acompanhe seus chamados e conte com a nossa equipe."
            : "Aqui está o panorama do atendimento de hoje."
        }
        action={
          <Link to="/chamados/novo">
            <Button>
              <Plus size={17} /> Novo chamado
            </Button>
          </Link>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {!staff ? (
          <>
            <StatCard
              label="Chamados abertos"
              value={open.length}
              detail="Em acompanhamento"
              icon={TicketIcon}
            />
            <StatCard
              label="Em atendimento"
              value={mine.filter((ticket) => ticket.status === "em_andamento").length}
              detail="Com a equipe"
              icon={Clock3}
              tone="violet"
            />
            <StatCard
              label="Aguardando minha resposta"
              value={waitingForRequester.length}
              detail="Verifique seus chamados"
              icon={MessageCircle}
              tone="orange"
            />
            <StatCard
              label="Finalizados"
              value={mine.filter((ticket) => ticket.status === "fechado").length}
              detail="Tickets fechados"
              icon={CheckCircle2}
              tone="blue"
            />
          </>
        ) : (
          <>
            <StatCard
              label="Chamados abertos"
              value={mine.filter((ticket) => ticket.status === "aberto").length}
              detail="Aguardando atendimento"
              icon={TicketIcon}
            />
            <StatCard
              label="Em andamento"
              value={mine.filter((ticket) => ticket.status === "em_andamento").length}
              detail="Em atendimento"
              icon={Clock3}
              tone="violet"
            />
            <StatCard
              label="Urgentes"
              value={urgent.length}
              detail={urgent.length ? "Atenção necessária" : "Tudo sob controle"}
              icon={Zap}
              tone="orange"
            />
            <StatCard
              label="Sem responsável"
              value={
                mine.filter((ticket) => !ticket.assignedTo && ticket.status !== "fechado").length
              }
              detail="Na fila agora"
              icon={TicketIcon}
              tone="orange"
            />
            <StatCard
              label="Acima do tempo médio"
              value={delayedTickets.length}
              detail={delayedTickets.length ? "Resposta pendente" : "Tudo em dia"}
              icon={Clock3}
              tone="orange"
            />
            <StatCard
              label="Atribuídos a mim"
              value={
                mine.filter(
                  (ticket) => ticket.assignedTo === user.id && ticket.status !== "fechado",
                ).length
              }
              detail="Meus atendimentos"
              icon={UserCheck}
              tone="teal"
            />
          </>
        )}
      </div>
      <div className="mt-7 grid gap-6 xl:grid-cols-[1fr_320px]">
        <section className="rounded-2xl border border-slate-100 bg-white shadow-soft">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
            <div>
              <h2 className="font-display font-bold text-ink">Chamados recentes</h2>
              <p className="mt-1 text-xs text-slate-400">Últimas atualizações do atendimento</p>
            </div>
            <Link to="/chamados" className="text-xs font-bold text-teal-700 hover:underline">
              Ver todos
            </Link>
          </div>
          {recent.length ? (
            <div className="divide-y divide-slate-100">
              {recent.map((ticket) => (
                <TicketRow key={ticket.id} ticket={ticket} data={data} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="Nenhum chamado ainda"
              text="Abra seu primeiro chamado para comecar."
              action={
                <Link to="/chamados/novo">
                  <Button>Abrir chamado</Button>
                </Link>
              }
            />
          )}
        </section>
        <section className="rounded-2xl bg-ink p-6 text-white">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-700">
            <Sparkles size={19} />
          </div>
          <h2 className="mt-6 font-display text-xl font-bold">
            Atendimento simples, do início ao fim.
          </h2>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Descreva seu problema com detalhes. Nossa equipe acompanha cada etapa por aqui.
          </p>
          <Link
            to="/chamados/novo"
            className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-teal-200 hover:text-white"
          >
            Abrir um chamado <ArrowRight size={15} />
          </Link>
          <div className="mt-8 border-t border-white/10 pt-4 text-[11px] text-slate-400">
            Tempo médio de primeira resposta{" "}
            <strong className="ml-1 text-teal-200">{averageResponse}</strong>
          </div>
        </section>
      </div>
    </>
  );
}
