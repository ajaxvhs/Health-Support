import { useState, type FormEvent, type ReactNode } from "react";
import { UserPlus } from "lucide-react";
import { Dialog } from "../../components/Dialog";
import { Button, SelectField, TextField } from "../../components/ui";
import { useApp } from "../../context/AppContext";
import { useToast } from "../../context/useToast";
import { roleOptions, type Profile, type Role } from "../../types";
import { formatPhone } from "../../lib/utils";

function UserModal({
  title,
  description,
  onClose,
  children,
  maxWidth = "max-w-lg",
}: {
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: "max-w-lg";
}) {
  return (
    <Dialog title={title} description={description} onClose={onClose} maxWidth={maxWidth}>
      {children}
    </Dialog>
  );
}

function UserFormLayout({
  title,
  description,
  onClose,
  tab,
  onTabChange,
  onSubmit,
  actions,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  tab: UserFormTab;
  onTabChange: (value: UserFormTab) => void;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void | Promise<void>;
  actions: ReactNode;
  children: ReactNode;
}) {
  const content = (
    <>
      <UserFormTabs value={tab} onChange={onTabChange} includeSecurity />
      <div className="h-[23rem] overflow-y-auto sm:h-[14rem]">{children}</div>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">{actions}</div>
    </>
  );

  return (
    <UserModal title={title} description={description} onClose={onClose}>
      {onSubmit ? <form onSubmit={onSubmit}>{content}</form> : content}
    </UserModal>
  );
}

const roleOptionElements = roleOptions.map((option) => (
  <option key={option.value} value={option.value}>
    {option.label}
  </option>
));

type UserFormTab = "personal" | "access" | "security";

function UserFormTabs({
  value,
  onChange,
  includeSecurity = false,
}: {
  value: UserFormTab;
  onChange: (value: UserFormTab) => void;
  includeSecurity?: boolean;
}) {
  const tabs: Array<{ value: UserFormTab; label: string }> = [
    { value: "personal", label: "Dados pessoais" },
    { value: "access", label: "Acesso" },
    ...(includeSecurity ? [{ value: "security" as const, label: "Segurança" }] : []),
  ];
  return (
    <div className="mt-5 flex gap-1 overflow-x-auto rounded-xl bg-surface-muted p-1">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          aria-selected={value === tab.value}
          className={`min-h-10 min-w-0 flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-bold transition ${value === tab.value ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function CreateUserForm({ onClose }: { onClose: () => void }) {
  const { data, repo, refresh } = useApp();
  const { showToast } = useToast();
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [unitId, setUnitId] = useState(data.units[0]?.id ?? "");
  const [role, setRole] = useState<Role>("solicitante");
  const [tab, setTab] = useState<UserFormTab>("personal");
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (
      !fullName.trim() ||
      !username.trim() ||
      !email.trim() ||
      !phone.trim() ||
      !unitId ||
      !role
    ) {
      showToast("Preencha todos os campos obrigatórios.", "error");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      showToast("Informe um e-mail válido.", "error");
      return;
    }
    if (temporaryPassword.length < 8) {
      showToast("A senha temporária precisa ter pelo menos 8 caracteres.", "error");
      return;
    }
    setSaving(true);
    try {
      await repo.createUser({ fullName, username, email, phone, temporaryPassword, unitId, role });
      await refresh();
      showToast("Usuário criado com senha temporária.");
      onClose();
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : "Não foi possível criar o usuário.";
      showToast(message, "error");
    } finally {
      setSaving(false);
    }
  };
  return (
    <UserFormLayout
      title="Novo usuário"
      description="A conta será criada com senha temporária e troca obrigatória no primeiro acesso."
      onClose={onClose}
      tab={tab}
      onTabChange={setTab}
      onSubmit={submit}
      actions={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" loading={saving}>
            <UserPlus size={16} /> Criar usuário
          </Button>
        </>
      }
    >
      {tab === "personal" ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <TextField label="Nome completo" value={fullName} onChange={setFullName} />
          <TextField label="Usuário" value={username} onChange={setUsername} autoComplete="off" />
          <TextField
            label="E-mail"
            value={email}
            onChange={setEmail}
            type="text"
            autoComplete="off"
            inputMode="email"
          />
          <TextField
            label="Telefone"
            value={phone}
            onChange={(value) => setPhone(formatPhone(value))}
            inputMode="tel"
          />
        </div>
      ) : tab === "access" ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <SelectField label="Unidade" value={unitId} onChange={setUnitId}>
            {data.units
              .filter((unit) => unit.isActive)
              .map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
          </SelectField>
          <SelectField label="Perfil" value={role} onChange={(value) => setRole(value as Role)}>
            {roleOptionElements}
          </SelectField>
        </div>
      ) : (
        <div className="mt-6 max-w-md">
          <TextField
            label="Senha temporária"
            value={temporaryPassword}
            onChange={setTemporaryPassword}
            type="password"
            autoComplete="new-password"
            hint="Use pelo menos 8 caracteres"
          />
        </div>
      )}
    </UserFormLayout>
  );
}

export function EditUserForm({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const { data, repo, refresh } = useApp();
  const { showToast } = useToast();
  const [fullName, setFullName] = useState(profile.fullName);
  const [username, setUsername] = useState(profile.username);
  const [email, setEmail] = useState(profile.email);
  const [phone, setPhone] = useState(formatPhone(profile.phone));
  const [tab, setTab] = useState<UserFormTab>("personal");
  const [resetPassword, setResetPassword] = useState("");
  const [unitId, setUnitId] = useState(profile.unitId);
  const [role, setRole] = useState<Role>(profile.role);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await repo.updateUser(profile.id, { fullName, username, email, phone, unitId, role });
      await refresh();
      showToast("Usuário atualizado.");
      onClose();
    } catch (reason) {
      const message =
        reason instanceof Error ? reason.message : "Não foi possível atualizar o usuário.";
      showToast(message, "error");
    } finally {
      setSaving(false);
    }
  };
  return (
    <UserFormLayout
      title="Editar usuário"
      description={`Atualize os dados e as permissões de ${profile.fullName}.`}
      onClose={onClose}
      tab={tab}
      onTabChange={setTab}
      actions={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          {tab === "security" && (
            <Button
              onClick={async () => {
                try {
                  await repo.resetUserPassword(profile.id, resetPassword);
                  await refresh();
                  showToast("Senha redefinida. O usuário deverá trocá-la no próximo acesso.");
                  setResetPassword("");
                } catch (reason) {
                  const message =
                    reason instanceof Error
                      ? reason.message
                      : "Não foi possível redefinir a senha.";
                  showToast(message, "error");
                }
              }}
            >
              Redefinir senha
            </Button>
          )}
          {tab !== "security" && (
            <Button onClick={save} loading={saving}>
              Salvar alterações
            </Button>
          )}
        </>
      }
    >
      {tab !== "security" ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {tab === "personal" ? (
            <>
              <TextField label="Nome completo" value={fullName} onChange={setFullName} required />
              <TextField
                label="Usuário"
                value={username}
                onChange={setUsername}
                autoComplete="off"
                required
              />
              <TextField
                label="E-mail"
                value={email}
                onChange={setEmail}
                type="email"
                autoComplete="off"
                required
              />
              <TextField
                label="Telefone"
                value={phone}
                onChange={(value) => setPhone(formatPhone(value))}
                inputMode="tel"
                required
              />
            </>
          ) : (
            <>
              <SelectField label="Unidade" value={unitId} onChange={setUnitId} required>
                {data.units
                  .filter((unit) => unit.isActive || unit.id === profile.unitId)
                  .map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
              </SelectField>
              <SelectField
                label="Perfil"
                value={role}
                onChange={(value) => setRole(value as Role)}
                required
              >
                {roleOptionElements}
              </SelectField>
            </>
          )}
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <p className="text-sm leading-6 text-secondary">
            Redefina a senha sem exigir a senha atual. O usuário deverá trocar essa senha no próximo
            acesso.
          </p>
          <TextField
            label="Nova senha"
            value={resetPassword}
            onChange={setResetPassword}
            type="password"
            autoComplete="new-password"
            required
            hint="Use pelo menos 8 caracteres"
          />
        </div>
      )}
    </UserFormLayout>
  );
}
