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
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Button, EmptyState, PageHeader, StatCard } from "../../components/ui";
import { useApp } from "../../context/AppContext";
import { isStaff } from "../../lib/permissions";
import { TicketRow } from "../tickets/TicketRow";
import { useToast } from "../../context/useToast";
import { errorMessage } from "../../lib/utils";
import { queryCache } from "../../lib/queryCache";

export function DashboardPage() {
  const { data, user, repo } = useApp();
  const { showToast } = useToast();
  const dashboardQuery = useQuery({
    queryKey: ["ticket-dashboard", user.id],
    queryFn: () => repo.getTicketDashboard(),
    ...queryCache.ticketDashboard,
  });
  useEffect(() => {
    if (dashboardQuery.error)
      showToast(
        errorMessage(dashboardQuery.error, "Não foi possível carregar o resumo dos chamados."),
        "error",
      );
  }, [dashboardQuery.error, showToast]);
  const staff = isStaff(user.role);
  const summary = dashboardQuery.data ?? {
    openCount: 0,
    inProgressCount: 0,
    closedCount: 0,
    waitingCount: 0,
    urgentCount: 0,
    unassignedCount: 0,
    assignedToMeCount: 0,
    waitingForRequesterCount: 0,
    tickets: [],
  };
  const recent = summary.tickets;
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
              value={summary.openCount}
              detail="Em acompanhamento"
              icon={TicketIcon}
            />
            <StatCard
              label="Em atendimento"
              value={summary.inProgressCount}
              detail="Com a equipe"
              icon={Clock3}
              tone="violet"
            />
            <StatCard
              label="Aguardando minha resposta"
              value={summary.waitingForRequesterCount}
              detail="Verifique seus chamados"
              icon={MessageCircle}
              tone="orange"
            />
            <StatCard
              label="Finalizados"
              value={summary.closedCount}
              detail="Tickets fechados"
              icon={CheckCircle2}
              tone="blue"
            />
          </>
        ) : (
          <>
            <StatCard
              label="Chamados abertos"
              value={summary.waitingCount}
              detail="Aguardando atendimento"
              icon={TicketIcon}
            />
            <StatCard
              label="Em andamento"
              value={summary.inProgressCount}
              detail="Em atendimento"
              icon={Clock3}
              tone="violet"
            />
            <StatCard
              label="Urgentes"
              value={summary.urgentCount}
              detail={summary.urgentCount ? "Atenção necessária" : "Tudo sob controle"}
              icon={Zap}
              tone="orange"
            />
            <StatCard
              label="Sem responsável"
              value={summary.unassignedCount}
              detail="Na fila agora"
              icon={UserX}
              tone="teal"
            />
            <StatCard
              label="Atribuídos a mim"
              value={summary.assignedToMeCount}
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
