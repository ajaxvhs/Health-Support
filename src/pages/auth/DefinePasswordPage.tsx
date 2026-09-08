import { useState, type FormEvent } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button, TextField } from "../../components/ui";
import { useApp } from "../../context/AppContext";
import { passwordUpdateErrorMessage, updatePassword } from "../../lib/auth";
import { useToast } from "../../context/useToast";

export function DefinePasswordPage() {
  const { refresh } = useApp();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (newPassword !== confirmation) {
      showToast("A confirmação da nova senha não confere.", "error");
      return;
    }
    setSaving(true);
    try {
      await updatePassword(newPassword);
      await refresh();
      navigate("/", { replace: true });
    } catch (reason) {
      showToast(
        reason instanceof Error ? reason.message : passwordUpdateErrorMessage(reason),
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-5 py-10">
      <div className="w-full max-w-md rounded-3xl border border-slate-100 bg-white p-7 shadow-soft sm:p-10">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
          <LockKeyhole size={22} />
        </span>
        <h1 className="mt-5 font-display text-2xl font-bold text-ink">Defina sua senha</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Por segurança, troque a senha temporária antes de continuar.
        </p>
        <form onSubmit={submit} className="mt-7 space-y-5">
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
          <Button loading={saving} className="w-full">
            Continuar <ArrowRight size={16} />
          </Button>
        </form>
      </div>
    </div>
  );
}
