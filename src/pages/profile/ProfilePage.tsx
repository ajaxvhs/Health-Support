import { useState } from "react";
import { Avatar, Button, PageHeader, PillTabs, TextField } from "../../components/ui";
import { useApp } from "../../context/AppContext";
import { unitName } from "../../lib/selectors";
import { useToast } from "../../context/useToast";
import { passwordUpdateErrorMessage, updatePassword } from "../../lib/auth";
import { roleLabels } from "../../types";
import { formatPhone } from "../../lib/utils";
import { PushNotificationSettings } from "../../components/PushNotificationSettings";

export function ProfilePage() {
  const { user, data, repo, refresh } = useApp();
  const { showToast } = useToast();
  const [name, setName] = useState(user.fullName);
  const [phone, setPhone] = useState(formatPhone(user.phone));
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [activeTab, setActiveTab] = useState("info");

  return (
    <>
      <PageHeader
        eyebrow="Sua conta"
        title="Meu perfil"
        description="Mantenha seus dados de contato atualizados."
      />
      <PillTabs
        ariaLabel="Seções do perfil"
        value={activeTab}
        onChange={setActiveTab}
        tabs={[
          { value: "info", label: "Minhas informações" },
          { value: "security", label: "Segurança" },
          { value: "settings", label: "Configurações" },
        ]}
      />
      <div className="max-w-4xl">
        {activeTab === "info" ? (
          <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-soft sm:p-8">
            <div className="mb-8 flex flex-col items-start gap-5 border-b border-slate-100 pb-7 sm:flex-row sm:items-center">
              <Avatar user={user} size="lg" />
              <div>
                <h2 className="font-display text-lg font-bold text-ink">{user.fullName}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {roleLabels[user.role]} · {unitName(data, user.unitId)}
                </p>
                <p className="mt-2 text-xs text-teal-700">{user.email}</p>
              </div>
            </div>
            <div className="grid gap-6 sm:grid-cols-2">
              <TextField label="Nome completo" value={name} onChange={setName} required />
              <TextField
                label="Telefone"
                value={phone}
                onChange={(value) => setPhone(formatPhone(value))}
                inputMode="tel"
                required
              />
              <TextField
                label="E-mail institucional"
                value={user.email}
                readOnly
                hint="O e-mail é gerenciado pelo administrador"
              />
              <TextField label="Perfil de acesso" value={roleLabels[user.role]} readOnly />
            </div>
            <div className="mt-8 flex flex-col gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:justify-end">
              <Button
                className="w-full sm:w-auto"
                onClick={async () => {
                  try {
                    await repo.saveProfile({ fullName: name, phone });
                    await refresh();
                    showToast("Dados do perfil atualizados.");
                  } catch (reason) {
                    showToast(
                      reason instanceof Error
                        ? reason.message
                        : "Não foi possível atualizar o perfil.",
                      "error",
                    );
                  }
                }}
              >
                Salvar alterações
              </Button>
            </div>
          </section>
        ) : activeTab === "security" ? (
          <section className="max-w-2xl rounded-2xl border border-slate-100 bg-white p-5 shadow-soft sm:p-8">
            <div className="space-y-6">
              <TextField
                label="Senha atual"
                value={currentPassword}
                onChange={setCurrentPassword}
                type="password"
                required
              />
              <TextField
                label="Nova senha"
                value={newPassword}
                onChange={setNewPassword}
                type="password"
                required
                hint="Use pelo menos 8 caracteres"
              />
              <TextField
                label="Confirmar nova senha"
                value={confirmation}
                onChange={setConfirmation}
                type="password"
                required
              />
            </div>
            <div className="mt-8 flex justify-end">
              <Button
                variant="secondary"
                className="w-full sm:w-auto"
                onClick={async () => {
                  try {
                    if (newPassword !== confirmation) {
                      showToast("A confirmação da nova senha não confere.", "error");
                      return;
                    }
                    await updatePassword(newPassword, currentPassword);
                    await refresh();
                    showToast("Senha atualizada com sucesso.");
                    setCurrentPassword("");
                    setNewPassword("");
                    setConfirmation("");
                  } catch (reason) {
                    showToast(
                      reason instanceof Error ? reason.message : passwordUpdateErrorMessage(reason),
                      "error",
                    );
                  }
                }}
              >
                Atualizar senha
              </Button>
            </div>
          </section>
        ) : (
          <div className="max-w-xl">
            <PushNotificationSettings />
          </div>
        )}
      </div>
    </>
  );
}
