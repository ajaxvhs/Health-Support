import { useState, type FormEvent } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button, TextField } from "../../components/ui";
import { useApp } from "../../context/AppContext";
import { passwordUpdateErrorMessage, updatePassword } from "../../lib/auth";
import { useToast } from "../../context/useToast";
import { refreshAndNotify } from "../../lib/utils";

export function DefinePasswordPage() {
  const { refresh, updateCurrentProfile } = useApp();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!newPassword) {
      showToast("Informe a nova senha.", "error");
      return;
    }
    if (newPassword.length < 8) {
      showToast("A nova senha precisa ter pelo menos 8 caracteres.", "error");
      return;
    }
    if (!confirmation) {
      showToast("Confirme a nova senha.", "error");
      return;
    }
    if (newPassword !== confirmation) {
      showToast("A confirmação da nova senha não confere.", "error");
      return;
    }
    setSaving(true);
    try {
      await updatePassword(newPassword);
      updateCurrentProfile({ mustChangePassword: false });
      await refreshAndNotify(refresh, showToast, "Senha atualizada com sucesso.");
      navigate("/", { replace: true });
    } catch (reason) {
      showToast(passwordUpdateErrorMessage(reason), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100dvh-8rem)] w-full items-center justify-center">
      <div className="w-full max-w-md rounded-3xl border border-line-soft bg-surface p-6 shadow-soft sm:p-8">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-soft text-brand-contrast">
          <LockKeyhole size={22} />
        </span>
        <h1 className="mt-4 font-display text-2xl font-bold text-ink">Defina sua senha</h1>
        <p className="mt-2 text-sm leading-6 text-secondary">
          Por segurança, troque a senha temporária antes de continuar.
        </p>
        <form noValidate onSubmit={submit} className="mt-6 space-y-4">
          <TextField
            label="Nova senha"
            value={newPassword}
            onChange={setNewPassword}
            type="password"
            required
            autoFocus
            autoComplete="new-password"
            hint="Use pelo menos 8 caracteres"
          />
          <TextField
            label="Confirmar nova senha"
            value={confirmation}
            onChange={setConfirmation}
            type="password"
            required
            autoComplete="new-password"
          />
          <Button type="submit" loading={saving} className="min-h-12 w-full text-base">
            Continuar <ArrowRight size={16} />
          </Button>
        </form>
      </div>
    </div>
  );
}
