import { useState } from "react";
import { UserPlus } from "lucide-react";
import {
  BulkActionButtons,
  Button,
  ConfirmDialog,
  PageHeader,
  TopSearch,
} from "../../components/ui";
import { useApp } from "../../context/AppContext";
import { unitName } from "../../lib/selectors";
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
  const visibleIds = users
    .filter((profile) => profile.id !== app.user.id)
    .map((profile) => profile.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id));
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
          onSearch={setSearch}
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
        <div className="min-w-[1050px]">
          <div className="grid grid-cols-[36px_minmax(250px,1.55fr)_minmax(145px,1fr)_minmax(145px,0.9fr)_110px_minmax(275px,auto)] gap-4 border-b border-slate-100 bg-slate-50/60 px-5 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
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
          {users.map((profile) => (
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
