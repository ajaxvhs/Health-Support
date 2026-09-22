import {
  CheckCircle2,
  Clock3,
  MessageCircle,
  Plus,
  Ticket as TicketIcon,
  UserCheck,
  UserX,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button, EmptyState, PageHeader, StatCard } from "../../components/ui";
import { useApp } from "../../context/AppContext";
import { isStaff } from "../../lib/permissions";
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
  const recent = [...mine]
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
    .slice(0, 5);
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
              icon={UserX}
              tone="teal"
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
      <div className="mt-7">
        <section className="rounded-2xl border border-line-soft bg-surface shadow-soft">
          <div className="flex items-center justify-between border-b border-line-soft px-5 py-4 sm:px-6">
            <div>
              <h2 className="font-display font-bold text-ink">Chamados recentes</h2>
              <p className="mt-1 text-xs text-subtle">Últimas atualizações do atendimento</p>
            </div>
            <Link to="/chamados" className="text-xs font-bold text-brand hover:underline">
              Ver todos
            </Link>
          </div>
          {recent.length ? (
            <div className="divide-y divide-line-soft">
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
      </div>
    </>
  );
}
