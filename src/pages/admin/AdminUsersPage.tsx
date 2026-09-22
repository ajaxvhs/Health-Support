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
import { getPagination, getPaginationItems } from "../../lib/pagination";
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
  const [page, setPage] = useState(1);
  const {
    page: currentPage,
    pageCount,
    start: pageStart,
    end: pageEnd,
  } = getPagination(page, users.length);
  const pageUsers = users.slice(pageStart, pageEnd);
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
      <div className="mx-auto w-full max-w-[1320px]">
        <PageHeader
          eyebrow="Administração"
          title="Usuários"
          description="Gerencie quem pode acessar o portal e suas permissões."
          action={
            <Button className="w-full sm:w-auto" onClick={() => setShowForm(true)}>
              <UserPlus size={17} /> Novo usuário
            </Button>
          }
        />
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-line-soft bg-surface p-3 shadow-soft sm:gap-4 sm:p-4">
          <TopSearch
            value={search}
            onSearch={updateSearch}
            placeholder="Buscar usuário, e-mail ou unidade"
            className="w-full min-w-0 max-w-none flex-[1_1_24rem]"
          />
          <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-3 sm:w-auto sm:justify-end">
            <span className="shrink-0 text-xs text-subtle">
              {users.length} usuários cadastrados
            </span>
            {selected.length > 0 && (
              <BulkActionButtons
                onActivate={() => bulkAction("activate")}
                onDeactivate={() => bulkAction("deactivate")}
                onDelete={() => bulkAction("delete")}
              />
            )}
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-line-soft bg-surface shadow-soft">
          <div className="hidden border-b border-line-soft bg-surface-soft/60 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-subtle lg:grid lg:grid-cols-[28px_minmax(0,1.65fr)_minmax(0,1fr)_148px_80px_132px] lg:gap-2 xl:grid-cols-[36px_minmax(280px,2fr)_minmax(150px,1.1fr)_148px_90px_132px] xl:gap-4 xl:px-5 xl:py-3">
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
                className="h-4 w-4 cursor-pointer rounded border-line-strong text-brand focus:ring-brand"
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
          {users.length > 0 && (
            <div className="grid gap-3 border-t border-line-soft px-4 py-3 text-xs text-muted sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:px-5">
              <span className="sm:justify-self-start">
                Exibindo {pageStart + 1}-{pageEnd} de {users.length} usuários
              </span>
              <div className="flex items-center justify-center gap-1 sm:justify-self-center">
                <button
                  type="button"
                  aria-label="Página anterior"
                  disabled={currentPage === 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-muted transition hover:bg-surface-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft size={16} />
                </button>
                {getPaginationItems(currentPage, pageCount).map((item, index) =>
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
                          ? "bg-brand-strong text-on-brand"
                          : "text-muted hover:bg-surface-soft hover:text-ink",
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
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-muted transition hover:bg-surface-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
              <span aria-hidden="true" className="hidden sm:block" />
            </div>
          )}
        </div>
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
