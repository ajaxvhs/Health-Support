import { useState } from "react";
import {
  Activity,
  BookOpen,
  Clock3,
  Ticket,
  UserCheck,
  UserPlus,
  UserX,
  Users,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { ReactNode } from "react";
import { PageHeader, Button, StatCard, TopSearch } from "../components/ui";
import { SkeletonTableRows, SkeletonText } from "../components/Skeleton";
import { TicketDetailLoading } from "./tickets/TicketDetailPage";
import { TicketRowSkeleton } from "./tickets/TicketRow";
import { FilterField, FilterToolbar } from "../components/filters";
import { TicketsFilterBar } from "./tickets/TicketsFilterBar";
import { useSession } from "../context/AppContext";
import type { TicketFilters } from "../lib/utils";
import type { TicketStatus } from "../types";

function PreviewSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-label={title} className="scroll-mt-6 space-y-4" aria-busy="true">
      {children}
    </section>
  );
}

function UserSearchPreview() {
  const [search, setSearch] = useState("");
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-line-soft bg-surface p-3 shadow-soft sm:gap-4 sm:p-4">
      <TopSearch
        value={search}
        onSearch={setSearch}
        placeholder="Buscar usuário, e-mail ou unidade"
        className="w-full min-w-0 max-w-none flex-[1_1_24rem]"
      />
      <span className="ml-auto shrink-0 text-xs text-subtle">
        <SkeletonText className="inline-block h-3 w-6 align-middle" /> usuários cadastrados
      </span>
    </div>
  );
}

function UserTableHeader() {
  return (
    <div className="hidden border-b border-line-soft bg-surface-soft/60 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-subtle lg:grid lg:grid-cols-[28px_minmax(0,1.65fr)_minmax(0,1fr)_148px_80px_132px] lg:gap-2 xl:grid-cols-[36px_minmax(280px,2fr)_minmax(150px,1.1fr)_148px_90px_132px] xl:gap-4 xl:px-5 xl:py-3">
      <span aria-hidden="true" />
      <span>Usuário</span>
      <span className="text-center">Unidade</span>
      <span className="text-center">Perfil</span>
      <span className="text-center">Status</span>
      <span className="text-center">Ações</span>
    </div>
  );
}

export function SkeletonPreviewPage() {
  const { data } = useSession();
  const [ticketFilters, setTicketFilters] = useState<TicketFilters>({
    search: "",
    status: "todos",
    priorityId: "",
    unitId: "",
    requesterId: "",
    dateRange: "all",
    sort: "priority",
  });
  const [showTicketFilters, setShowTicketFilters] = useState(false);
  const [assignedToMe, setAssignedToMe] = useState(false);
  const updateTicketFilter = (key: keyof TicketFilters, value: string) =>
    setTicketFilters((current) => ({ ...current, [key]: value }));
  const updateStatuses = (statuses: TicketStatus[]) =>
    setTicketFilters((current) => ({ ...current, statusSelection: statuses }));
  return (
    <main className="mx-auto w-full max-w-[1320px] space-y-10 p-4 sm:p-8">
      <PageHeader
        eyebrow="Prévia local"
        title="Skeletons das telas"
        description="Os skeletons ocupam somente os dados que ainda vêm do banco. Os componentes e espaços da página permanecem visíveis."
      />
      <nav aria-label="Telas na prévia" className="flex flex-wrap gap-2">
        {[
          ["dashboard", "Dashboard"],
          ["chamados", "Chamados"],
          ["detalhe", "Detalhe"],
          ["usuarios", "Usuários"],
          ["auditoria", "Auditoria"],
        ].map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="rounded-lg border border-line-soft bg-surface px-3 py-2 text-sm font-semibold text-secondary hover:bg-surface-soft"
          >
            {label}
          </a>
        ))}
        <Link
          to="/entrar"
          className="ml-auto rounded-lg px-3 py-2 text-sm font-semibold text-brand hover:underline"
        >
          Sair da prévia
        </Link>
      </nav>

      <PreviewSection id="dashboard" title="Dashboard">
        <PageHeader
          eyebrow="Início"
          title="Olá"
          description="Aqui está o panorama do atendimento de hoje."
          action={
            <Button>
              <Ticket size={17} /> Novo chamado
            </Button>
          }
        />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
          <StatCard
            label="Chamados abertos"
            value={<SkeletonText className="h-7 w-12" />}
            detail="Aguardando atendimento"
            icon={Ticket}
          />
          <StatCard
            label="Em andamento"
            value={<SkeletonText className="h-7 w-12" />}
            detail="Em atendimento"
            icon={Clock3}
            tone="violet"
          />
          <StatCard
            label="Urgentes"
            value={<SkeletonText className="h-7 w-12" />}
            detail="Atenção necessária"
            icon={Zap}
            tone="orange"
          />
          <StatCard
            label="Sem responsável"
            value={<SkeletonText className="h-7 w-12" />}
            detail="Na fila agora"
            icon={UserX}
            tone="teal"
          />
          <StatCard
            label="Atribuídos a mim"
            value={<SkeletonText className="h-7 w-12" />}
            detail="Meus atendimentos"
            icon={UserCheck}
            tone="teal"
          />
        </div>
        <section className="rounded-2xl border border-line-soft bg-surface shadow-soft">
          <div className="flex items-center justify-between border-b border-line-soft px-5 py-4 sm:px-6">
            <div>
              <h3 className="font-display font-bold text-ink">Chamados recentes</h3>
              <p className="mt-1 text-xs text-subtle">Últimas atualizações do atendimento</p>
            </div>
            <span className="text-xs font-bold text-brand">Ver todos</span>
          </div>
          <div aria-hidden="true" className="divide-y divide-line-soft">
            {Array.from({ length: 4 }, (_, i) => (
              <TicketRowSkeleton key={i} />
            ))}
          </div>
        </section>
      </PreviewSection>

      <PreviewSection id="chamados" title="Lista e fila de atendimento">
        <PageHeader
          stackUntil="tablet"
          eyebrow="Chamados"
          title="Fila de atendimento"
          description="Priorize, assuma e acompanhe os chamados das unidades."
          action={
            <div className="flex gap-3">
              <Button>Novo chamado</Button>
              <Button variant="secondary">Atualizar fila</Button>
            </div>
          }
        />
        <div className="mb-4 flex flex-col gap-3 min-[1120px]:flex-row min-[1120px]:items-center min-[1120px]:justify-between">
          <div
            role="tablist"
            className="grid w-full grid-cols-2 gap-1 rounded-xl border border-line bg-surface p-1 shadow-sm min-[1120px]:inline-flex min-[1120px]:w-auto"
          >
            <button
              role="tab"
              aria-selected="true"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-brand-strong px-3 text-xs font-bold text-on-brand"
            >
              <Ticket size={14} /> Fila de atendimento
            </button>
            <button
              role="tab"
              aria-selected="false"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-3 text-xs font-bold text-muted"
            >
              <Ticket size={14} /> Todos os chamados
            </button>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 text-center min-[1120px]:w-[240px]">
            <div className="rounded-xl bg-danger-soft px-3 py-2">
              <SkeletonText className="mx-auto h-5 w-8" />
              <span className="text-[10px] font-bold text-danger-strong">Sem responsável</span>
            </div>
            <div className="rounded-xl bg-caution-soft px-3 py-2">
              <SkeletonText className="mx-auto h-5 w-8" />
              <span className="text-[10px] font-bold text-caution-strong">Em atendimento</span>
            </div>
          </div>
        </div>
        <TicketsFilterBar
          view="queue"
          filters={ticketFilters}
          data={data}
          isStaff
          showFilters={showTicketFilters}
          assignedToMeOnly={assignedToMe}
          onSearch={(value) => updateTicketFilter("search", value)}
          onFilterChange={updateTicketFilter}
          onStatusSelectionChange={updateStatuses}
          onToggleFilters={() => setShowTicketFilters((open) => !open)}
          onToggleAssigned={setAssignedToMe}
          onResetFilters={() =>
            setTicketFilters({
              search: "",
              status: "todos",
              priorityId: "",
              unitId: "",
              requesterId: "",
              dateRange: "all",
              sort: "priority",
            })
          }
        />
        <div
          className="overflow-hidden rounded-2xl border border-line-soft bg-surface shadow-soft"
          aria-hidden="true"
        >
          <div className="divide-y divide-line-soft">
            {Array.from({ length: 6 }, (_, i) => (
              <TicketRowSkeleton key={i} queueMode />
            ))}
          </div>
        </div>
      </PreviewSection>

      <PreviewSection id="detalhe" title="Detalhe e conversa do chamado">
        <TicketDetailLoading />
      </PreviewSection>

      <PreviewSection id="usuarios" title="Administração de usuários">
        <PageHeader
          stackUntil="tablet"
          eyebrow="Administração"
          title="Usuários"
          description="Gerencie quem pode acessar o portal e suas permissões."
          action={
            <div className="flex gap-2">
              <Button variant="secondary">Atualizar</Button>
              <Button>
                <UserPlus size={17} /> Novo usuário
              </Button>
            </div>
          }
        />
        <UserSearchPreview />
        <div
          className="overflow-hidden rounded-2xl border border-line-soft bg-surface shadow-soft"
          aria-hidden="true"
        >
          <UserTableHeader />
          <SkeletonTableRows count={6} variant="users" />
        </div>
      </PreviewSection>

      <PreviewSection id="auditoria" title="Auditoria">
        <PageHeader
          stackUntil="tablet"
          eyebrow="Administração"
          title="Auditoria"
          description="Histórico append-only das alterações relevantes do sistema."
          action={<Button variant="secondary">Atualizar</Button>}
        />
        <div className="mb-5 grid gap-4 min-[1120px]:grid-cols-3" aria-hidden="true">
          <StatCard
            label="Eventos no período"
            value={<SkeletonText className="h-6 w-12" />}
            icon={Activity}
            compact
          />
          <StatCard
            label="Chamados com movimentação"
            value={<SkeletonText className="h-6 w-12" />}
            icon={BookOpen}
            tone="blue"
            compact
          />
          <StatCard
            label="Pessoas que atuaram"
            value={<SkeletonText className="h-6 w-12" />}
            icon={Users}
            tone="orange"
            compact
          />
        </div>
        <section className="relative rounded-2xl border border-line-soft bg-surface shadow-soft">
          <div className="relative z-20 border-b border-line-soft px-5 py-5 sm:px-7">
            <h3 className="font-display font-bold text-ink">Atividade recente</h3>
            <p className="mt-1 text-xs text-subtle">
              Filtre por responsável, período, ação ou texto.
            </p>
            <div className="mt-4">
              <FilterToolbar
                search=""
                onSearch={() => undefined}
                searchPlaceholder="Buscar no histórico ou chamado (#1)"
                stackUntil="tablet"
                open={false}
                onToggle={() => undefined}
                panelId="audit-preview-filters"
                chips={[]}
                onClear={() => undefined}
              >
                <FilterField label="Responsável">
                  <button className="min-h-10 w-full rounded-xl border border-line bg-surface px-3 text-left text-sm text-secondary">
                    Todos os responsáveis
                  </button>
                </FilterField>
                <FilterField label="Ação">
                  <button className="min-h-10 w-full rounded-xl border border-line bg-surface px-3 text-left text-sm text-secondary">
                    Todas as ações
                  </button>
                </FilterField>
                <FilterField label="Período">
                  <button className="min-h-10 w-full rounded-xl border border-line bg-surface px-3 text-left text-sm text-secondary">
                    Selecionar período
                  </button>
                </FilterField>
              </FilterToolbar>
            </div>
          </div>
          <div aria-hidden="true">
            <SkeletonTableRows count={6} />
          </div>
        </section>
      </PreviewSection>
    </main>
  );
}
