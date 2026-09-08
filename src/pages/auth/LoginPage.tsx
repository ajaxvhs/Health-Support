import { useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { Button, TextField } from "../../components/ui";
import { signInWithIdentifier } from "../../lib/auth";
import type { Profile } from "../../types";
import { useToast } from "../../context/useToast";

export function LoginPage({ onLogin }: { onLogin: (profile: Profile) => Promise<void> }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { showToast } = useToast();
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    try {
      await onLogin(await signInWithIdentifier(username, password));
    } catch (reason) {
      showToast(reason instanceof Error ? reason.message : "Não foi possível entrar.", "error");
    } finally {
      setLoading(false);
    }
  };
  return (
    <main className="relative flex min-h-[100svh] w-full flex-col overflow-hidden bg-[#eff5f3] px-4 py-6 sm:px-6 sm:py-8">
      <div className="pointer-events-none absolute -right-32 -top-36 h-96 w-96 rounded-full bg-teal-100/80 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-44 -left-24 h-80 w-80 rounded-full bg-white/70 blur-3xl" />
      <div className="pointer-events-none absolute left-[8%] top-[16%] h-52 w-52 rounded-full border border-teal-200/35" />
      <div className="pointer-events-none absolute inset-0 bg-dot-grid bg-[length:24px_24px] opacity-[0.22]" />
      <svg
        className="pointer-events-none absolute bottom-24 left-1/2 hidden h-12 w-64 -translate-x-1/2 text-teal-700/[0.08] sm:block"
        viewBox="0 0 256 48"
        fill="none"
        aria-hidden="true"
      >
        <path d="M0 24h76l10-17 16 34 12-25 9 8h133" stroke="currentColor" strokeWidth="2" />
      </svg>

      <div className="relative z-10 flex flex-1 items-center justify-center">
        <section className="relative w-full max-w-[472px] overflow-hidden rounded-[20px] border border-slate-200/80 bg-white p-8 shadow-soft sm:p-10">
          <div className="absolute left-8 right-8 top-0 h-1.5 rounded-b-full bg-teal-700 sm:left-10 sm:right-10" />
          <div className="flex justify-center">
            <div className="flex items-center gap-3">
              <img src="/favicon.svg" alt="" className="h-10 w-10 rounded-xl" />
              <span className="font-display text-[22px] font-bold tracking-[-0.04em] text-ink">
                Suporte<span className="text-teal-700"> Saúde</span>
              </span>
            </div>
          </div>

          <div className="mt-8 text-center">
            <p className="text-xs font-bold uppercase tracking-[.16em] text-teal-700">
              Portal interno
            </p>
            <h1 className="mt-2 font-display text-[27px] font-bold tracking-tight text-ink">
              Bem-vindo de volta
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Entre para acessar seus chamados de suporte.
            </p>
          </div>

          <form onSubmit={submit} className="mt-7 space-y-5" autoComplete="on">
            <TextField
              label="Usuário ou e-mail"
              value={username}
              onChange={setUsername}
              placeholder="seu.usuario ou seu@email.com"
              autoComplete="username"
              className="min-h-12"
              required
            />
            <div className="block">
              <span className="mb-2 block text-sm font-bold text-ink">
                Senha<span className="ml-1 text-teal-700">*</span>
              </span>
              <span className="relative block">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  aria-label="Senha"
                  className="min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3.5 pr-12 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-teal-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </div>
            <Button loading={loading} className="mt-1 min-h-12 w-full">
              Entrar no portal
              <ArrowRight size={17} />
            </Button>
          </form>

          <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-slate-500">
            <LockKeyhole size={13} className="text-slate-400" />
            Acesso restrito a usuários autorizados
          </p>
        </section>
      </div>

      <footer className="relative z-10 shrink-0 pt-6 text-center text-xs text-slate-400">
        Secretaria Municipal de Saúde <span className="px-1">•</span> v1.0.0
      </footer>
    </main>
  );
}
