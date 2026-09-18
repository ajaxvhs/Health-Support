import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, UserPlus } from "lucide-react";
import {
  BulkActionButtons,
  Button,
  ConfirmDialog,
  PageHeader,
  TopSearch,
} from "../../components/ui";
import { useApp } from "../../context/AppContext";
import { unitName } from "../../lib/selectors";
import { cn } from "../../lib/utils";
import { useToast } from "../../context/useToast";
import type { Profile } from "../../types";
import { AdminUserRow } from "./AdminUserRow";
import { CreateUserForm, EditUserForm } from "./AdminUserForms";
import { isUserReferenced, roleLabel } from "./userHelpers";

type ConfirmState = {
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: "primary" | "danger";
  action: () => Promise<void>;
} | null;

const PAGE_SIZE = 10;
type PageItem = number | "ellipsis";

function pageItems(currentPage: number, pageCount: number): PageItem[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  if (currentPage <= 4) return [1, 2, 3, 4, 5, "ellipsis", pageCount];
  if (currentPage >= pageCount - 3) {
    return [1, "ellipsis", pageCount - 4, pageCount - 3, pageCount - 2, pageCount - 1, pageCount];
  }
  return [1, "ellipsis", currentPage - 1, currentPage, currentPage + 1, "ellipsis", pageCount];
}

export function AdminUsersPage() {
  const app = useApp();
  const { data, repo, refresh } = app;
  const { showToast } = useToast();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  const query = search.trim().toLowerCase();
  const users = data.profiles.filter(
    (profile) =>
      !query ||
      `${profile.fullName} ${profile.username} ${profile.email} ${unitName(data, profile.unitId)}`
        .toLowerCase()
        .includes(query),
  );
  const pageCount = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
  const [page, setPage] = useState(1);
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageUsers = users.slice(pageStart, pageStart + PAGE_SIZE);
  const pageEnd = Math.min(pageStart + PAGE_SIZE, users.length);
  const visibleIds = pageUsers
    .filter((profile) => profile.id !== app.user.id)
    .map((profile) => profile.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));
  useEffect(() => {
    setPage((current) => Math.min(current, pageCount));
  }, [pageCount]);
  const updateSearch = (value: string) => {
    setSearch(value);
    setPage(1);
    setSelected([]);
  };
  const finish = async (action: () => Promise<void>) => {
    try {
      await action();
      await refresh();
      setSelected([]);
    } catch (reason) {
      showToast(
        reason instanceof Error ? reason.message : "Não foi possível concluir a ação.",
        "error",
      );
    }
  };
  const request = (next: ConfirmState) => setConfirm(next);
  const bulkAction = (actionType: string) => {
    if (!actionType || !selected.length) return;
    const ids = [...selected];
    const deleting = actionType === "delete";
    request({
      title: deleting
        ? "Excluir usuários selecionados"
        : actionType === "deactivate"
          ? "Desativar usuários selecionados"
          : "Ativar usuários selecionados",
      description: deleting
        ? "Usuários com histórico serão desativados para preservar os registros. Usuários sem referências poderão ser excluídos permanentemente."
        : `${actionType === "deactivate" ? "Os usuários selecionados perderão o acesso" : "Os usuários selecionados voltarão a ter acesso"}. Deseja continuar?`,
      confirmLabel: deleting
        ? "Excluir selecionados"
        : actionType === "deactivate"
          ? "Desativar selecionados"
          : "Ativar selecionados",
      variant: deleting ? "danger" : "primary",
      action: () =>
        finish(() =>
          deleting
            ? repo.bulkDeleteUsers(ids)
            : repo.bulkSetUsersActive(ids, actionType === "activate"),
        ),
    });
  };
  const confirmAction = (next: Exclude<ConfirmState, null>) => request(next);

  return (
    <>
      <PageHeader
        eyebrow="Administração"
        title="Usuários"
        description="Gerencie quem pode acessar o portal e suas permissões."
        action={
          <Button onClick={() => setShowForm(true)}>
            <UserPlus size={17} /> Novo usuário
          </Button>
        }
      />
      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-soft sm:flex-row sm:items-center sm:gap-5">
        <TopSearch
          value={search}
          onSearch={updateSearch}
          placeholder="Buscar usuário, e-mail ou unidade"
          className="w-full min-w-0 max-w-none flex-1"
        />
        <div className="flex shrink-0 flex-wrap items-center gap-3 sm:ml-auto">
          <span className="text-xs text-slate-400">{users.length} usuários cadastrados</span>
          {selected.length > 0 && (
            <BulkActionButtons
              onActivate={() => bulkAction("activate")}
              onDeactivate={() => bulkAction("deactivate")}
              onDelete={() => bulkAction("delete")}
            />
          )}
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-100 bg-white shadow-soft">
        <div className="min-w-0">
          <div className="hidden grid-cols-[28px_minmax(220px,2fr)_minmax(110px,1fr)_145px_80px_88px] gap-2 border-b border-slate-100 bg-slate-50/60 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 lg:grid 2xl:grid-cols-[36px_minmax(320px,2fr)_minmax(180px,1.1fr)_145px_110px_120px] 2xl:gap-4 2xl:px-5 2xl:py-3">
            <div className="flex items-center">
              <input
                type="checkbox"
                aria-label="Selecionar todos os usuários exibidos"
                checked={allVisibleSelected}
                onChange={() =>
                  setSelected(
                    allVisibleSelected
                      ? selected.filter((id) => !visibleIds.includes(id))
                      : [...new Set([...selected, ...visibleIds])],
                  )
                }
                className="h-4 w-4 cursor-pointer rounded border-slate-300 text-teal-700 focus:ring-teal-500"
              />
            </div>
            <span>Usuário</span>
            <span className="text-center">Unidade</span>
            <span className="text-center">Perfil</span>
            <span className="text-center">Status</span>
            <span className="text-center">Ações</span>
          </div>
          {pageUsers.map((profile) => (
            <AdminUserRow
              key={profile.id}
              profile={profile}
              data={data}
              selected={selected.includes(profile.id)}
              onSelect={(checked) =>
                setSelected((current) =>
                  checked
                    ? [...new Set([...current, profile.id])]
                    : current.filter((id) => id !== profile.id),
                )
              }
              onEdit={() => setEditing(profile)}
              onRoleChange={(role) =>
                confirmAction({
                  title: "Alterar perfil",
                  description: `O perfil de ${profile.fullName} será alterado para ${roleLabel(role)}. Deseja continuar?`,
                  confirmLabel: "Alterar perfil",
                  variant: "primary",
                  action: () =>
                    finish(async () => {
                      await repo.changeRole(profile.id, role);
                      showToast("Perfil atualizado.");
                    }),
                })
              }
              onToggle={() =>
                confirmAction({
                  title: profile.isActive ? "Desativar usuário" : "Ativar usuário",
                  description: profile.isActive
                    ? `Desativar ${profile.fullName} impedirá o acesso ao portal. O histórico será preservado.`
                    : `Ativar ${profile.fullName} permitirá novo acesso ao portal.`,
                  confirmLabel: profile.isActive ? "Desativar" : "Ativar",
                  action: () =>
                    finish(async () => {
                      await repo.toggleUser(profile.id);
                      showToast(`Usuário ${profile.isActive ? "desativado" : "ativado"}.`);
                    }),
                })
              }
              onDelete={() =>
                confirmAction({
                  title: "Excluir usuário",
                  description: isUserReferenced(data, profile.id)
                    ? "Este usuário tem registros relacionados. A exclusão será convertida em desativação para preservar o histórico."
                    : `Excluir ${profile.fullName} permanentemente? Essa ação não pode ser desfeita.`,
                  confirmLabel: "Excluir usuário",
                  variant: "danger",
                  action: () =>
                    finish(async () => {
                      const result = await repo.deleteUser(profile.id);
                      showToast(
                        result === "deactivated"
                          ? "Usuário desativado para preservar o histórico."
                          : "Usuário excluído.",
                      );
                    }),
                })
              }
              currentUserId={app.user.id}
            />
          ))}
        </div>
        {users.length > 0 && (
          <div className="grid gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:px-5">
            <span className="sm:justify-self-start">
              Exibindo {pageStart + 1}-{pageEnd} de {users.length} usuários
            </span>
            <div className="flex items-center justify-center gap-1 sm:justify-self-center">
              <button
                type="button"
                aria-label="Página anterior"
                disabled={currentPage === 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-teal-50 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={16} />
              </button>
              {pageItems(currentPage, pageCount).map((item, index) =>
                item === "ellipsis" ? (
                  <span
                    key={`ellipsis-${index}`}
                    className="flex h-10 w-10 items-center justify-center"
                  >
                    ...
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    aria-label={`Ir para a página ${item}`}
                    aria-current={item === currentPage ? "page" : undefined}
                    onClick={() => setPage(item)}
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-lg font-semibold transition",
                      item === currentPage
                        ? "bg-teal-700 text-white"
                        : "text-slate-500 hover:bg-teal-50 hover:text-teal-700",
                    )}
                  >
                    {item}
                  </button>
                ),
              )}
              <button
                type="button"
                aria-label="Próxima página"
                disabled={currentPage === pageCount}
                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-teal-50 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <span aria-hidden="true" className="hidden sm:block" />
          </div>
        )}
      </div>
      {showForm && <CreateUserForm onClose={() => setShowForm(false)} />}
      {editing && <EditUserForm profile={editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title ?? "Confirmar ação"}
        description={confirm?.description ?? ""}
        confirmLabel={confirm?.confirmLabel}
        variant={confirm?.variant}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const action = confirm?.action;
          setConfirm(null);
          action?.();
        }}
      />
    </>
  );
}
