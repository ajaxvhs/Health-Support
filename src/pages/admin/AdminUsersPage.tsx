import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, UserPlus } from "lucide-react";
import {
  BulkActionButtons,
  Button,
  ConfirmDialog,
  PageHeader,
  TopSearch,
} from "../../components/ui";
import { Pagination } from "../../components/Pagination";
import { useApp } from "../../context/AppContext";
import { unitName } from "../../lib/selectors";
import { getPagination } from "../../lib/pagination";
import { errorMessage } from "../../lib/utils";
import { executeAction } from "../../lib/actionRunner";
import { refreshAfterMutation } from "../../lib/utils";
import { queryCache } from "../../lib/queryCache";
import { useToast } from "../../context/useToast";
import { ADMIN_USER_LIMITS } from "../../../supabase/functions/_shared/adminUserLimits";
import type { Profile } from "../../types";
import { AdminUserRow } from "./AdminUserRow";
import { CreateUserForm, EditUserForm } from "./AdminUserForms";
import { roleLabel } from "./userHelpers";
import { SkeletonTableRows, SkeletonText } from "../../components/Skeleton";

type ConfirmState = {
  title: string;
  description: string;
  confirmLabel?: string;
  variant?: "primary" | "danger";
  action: () => Promise<void>;
} | null;

export function AdminUsersPage() {
  const app = useApp();
  const { data, repo, mergeProfiles } = app;
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const usersQuery = useQuery({
    queryKey: ["admin-users", app.user.id],
    queryFn: () => repo.getAdminUsers(),
    ...queryCache.adminUsers,
  });
  const refreshAffectedQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-users", app.user.id] }),
      queryClient.invalidateQueries({ queryKey: ["ticket-pages", app.user.id] }),
      queryClient.invalidateQueries({ queryKey: ["ticket-dashboard", app.user.id] }),
      queryClient.invalidateQueries({ queryKey: ["audit-pages", app.user.id] }),
    ]);
  };
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const users = usersQuery.data ?? [];
  const loadingUsers = usersQuery.isLoading;
  const usersError = Boolean(usersQuery.error) && !usersQuery.data;
  useEffect(() => {
    if (usersQuery.error)
      showToast(errorMessage(usersQuery.error, "Não foi possível carregar os usuários."), "error");
  }, [showToast, usersQuery.error]);
  useEffect(() => {
    if (usersQuery.data) mergeProfiles(usersQuery.data);
  }, [mergeProfiles, usersQuery.data]);

  const query = search.trim().toLowerCase();
  const filteredUsers = users.filter(
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
  } = getPagination(page, filteredUsers.length);
  const pageUsers = filteredUsers.slice(pageStart, pageEnd);
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
  const finish = async <T,>(action: () => Promise<T>, onSuccess?: (value: T) => void) => {
    const result = await executeAction(action, {
      fallback: "Não foi possível concluir a ação.",
      showToast,
    });
    if (!result.ok) return;
    setSelected([]);
    onSuccess?.(result.value);
    if (!(await refreshAfterMutation(refreshAffectedQueries))) {
      showToast(
        "A alteração foi salva, mas a lista não sincronizou. Atualize quando a conexão voltar.",
        "info",
      );
      return;
    }
  };
  const request = (next: ConfirmState) => setConfirm(next);
  const bulkAction = (actionType: string) => {
    if (!actionType || !selected.length) return;
    if (selected.length > ADMIN_USER_LIMITS.bulkIds) {
      showToast(`Selecione no máximo ${ADMIN_USER_LIMITS.bulkIds} usuários por operação.`, "error");
      return;
    }
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
        finish(
          async () => {
            if (deleting) {
              const { outcomes } = await repo.bulkDeleteUsers(ids);
              const deleted = outcomes.filter((item) => item.outcome === "deleted").length;
              const deactivated = outcomes.filter((item) => item.outcome === "deactivated").length;
              const failed = outcomes.filter((item) => item.outcome === "failed").length;
              const summary = [
                deleted ? `${deleted} excluído(s)` : "",
                deactivated ? `${deactivated} desativado(s) para preservar histórico` : "",
                failed ? `${failed} não concluído(s)` : "",
              ]
                .filter(Boolean)
                .join("; ");
              return {
                message: summary || "Nenhum usuário foi alterado.",
                kind:
                  failed === outcomes.length
                    ? ("error" as const)
                    : failed
                      ? ("info" as const)
                      : ("success" as const),
              };
            }
            await repo.bulkSetUsersActive(ids, actionType === "activate");
            return {
              message:
                actionType === "activate"
                  ? "Usuários ativados."
                  : "Usuários desativados para preservar o histórico.",
              kind: "success" as const,
            };
          },
          (notice) => showToast(notice.message, notice.kind),
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
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Button
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={() => void usersQuery.refetch()}
                loading={usersQuery.isFetching}
              >
                {!usersQuery.isFetching && <RefreshCw size={16} />} Atualizar
              </Button>
              <Button className="w-full sm:w-auto" onClick={() => setShowForm(true)}>
                <UserPlus size={17} /> Novo usuário
              </Button>
            </div>
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
              {loadingUsers ? (
                <span role="status" aria-label="Carregando total de usuários">
                  <SkeletonText className="inline-block h-3 w-6 align-middle" /> usuários
                  cadastrados
                </span>
              ) : (
                `${filteredUsers.length} usuários cadastrados`
              )}
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
          {loadingUsers ? (
            <div role="status" aria-busy="true" aria-label="Carregando usuários">
              <SkeletonTableRows count={6} variant="users" />
            </div>
          ) : usersError ? (
            <div className="p-8 text-center text-sm text-danger">
              A lista não foi carregada por completo. Tente atualizar novamente.
            </div>
          ) : (
            pageUsers.map((profile) => (
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
                      finish(
                        () => repo.changeRole(profile.id, role),
                        () => showToast("Perfil atualizado."),
                      ),
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
                      finish(
                        () => repo.setUserActive(profile.id, !profile.isActive),
                        () => showToast(`Usuário ${profile.isActive ? "desativado" : "ativado"}.`),
                      ),
                  })
                }
                onDelete={() =>
                  confirmAction({
                    title: "Excluir usuário",
                    description: `Excluir ${profile.fullName}? Se houver registros relacionados, o acesso será desativado para preservar o histórico; caso contrário, o usuário será removido.`,
                    confirmLabel: "Excluir usuário",
                    variant: "danger",
                    action: () =>
                      finish(
                        () => repo.deleteUser(profile.id),
                        (result) => {
                          showToast(
                            result.outcome === "deactivated"
                              ? "Usuário desativado para preservar o histórico."
                              : "Usuário excluído.",
                          );
                        },
                      ),
                  })
                }
                currentUserId={app.user.id}
              />
            ))
          )}
          {!loadingUsers && !usersError && filteredUsers.length > 0 && (
            <Pagination
              currentPage={currentPage}
              pageCount={pageCount}
              start={pageStart}
              end={pageEnd}
              total={filteredUsers.length}
              itemLabel="usuários"
              ariaLabel="Paginação de usuários"
              onPageChange={setPage}
            />
          )}
        </div>
      </div>
      {showForm && (
        <CreateUserForm
          onClose={(saved) => {
            setShowForm(false);
            if (saved) void refreshAffectedQueries();
          }}
        />
      )}
      {editing && (
        <EditUserForm
          profile={editing}
          onClose={(saved) => {
            setEditing(null);
            if (saved) void refreshAffectedQueries();
          }}
        />
      )}
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
