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
    <main className="relative flex min-h-[100svh] w-full flex-col overflow-hidden bg-canvas-soft px-4 py-6 sm:px-6 sm:py-8">
      <div className="pointer-events-none absolute inset-0 bg-dot-grid bg-[length:24px_24px] opacity-[0.22]" />
      <svg
        className="pointer-events-none absolute bottom-24 left-1/2 hidden h-12 w-64 -translate-x-1/2 text-brand-strong/[0.14] sm:block"
        viewBox="0 0 256 48"
        fill="none"
        aria-hidden="true"
      >
        <path d="M0 24h76l10-17 16 34 12-25 9 8h133" stroke="currentColor" strokeWidth="2" />
      </svg>

      <div className="relative z-10 flex flex-1 items-center justify-center">
        <section className="relative w-full max-w-[472px] overflow-hidden rounded-[20px] border border-line/80 bg-surface p-8 shadow-soft sm:p-10">
          <div className="absolute left-8 right-8 top-0 h-1.5 rounded-b-full bg-brand-strong sm:left-10 sm:right-10" />
          <div className="flex justify-center">
            <div className="flex items-center gap-3">
              <img src="/favicon.svg" alt="" className="h-10 w-10 rounded-xl" />
              <span className="font-display text-[22px] font-bold tracking-[-0.04em] text-ink">
                Suporte<span className="text-brand-strong"> Saúde</span>
              </span>
            </div>
          </div>

          <div className="mt-8 text-center">
            <p className="text-xs font-bold uppercase tracking-[.16em] text-brand-strong">
              Portal interno
            </p>
            <h1 className="mt-2 font-display text-[27px] font-bold tracking-tight text-ink">
              Bem-vindo de volta
            </h1>
            <p className="mt-2 text-sm leading-6 text-secondary">
              Entre para acessar seus chamados de suporte.
            </p>
          </div>

          <form onSubmit={submit} className="mt-7 space-y-5" autoComplete="on">
            <TextField
              label="Usuário"
              value={username}
              onChange={setUsername}
              placeholder="seu.usuario"
              autoComplete="username"
              autoFocus
              className="min-h-12"
              required
              showRequiredIndicator={false}
            />
            <div className="block">
              <span className="mb-2 block text-sm font-bold text-ink">Senha</span>
              <span className="relative block">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  aria-label="Senha"
                  className="min-h-12 w-full rounded-xl border border-line-strong bg-surface px-3.5 pr-12 text-sm text-ink outline-none transition placeholder:text-subtle focus:border-brand-focus focus:ring-2 focus:ring-brand-soft"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  onClick={() => setShowPassword((visible) => !visible)}
                  className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-subtle transition hover:bg-surface-muted hover:text-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-focus"
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </div>
            <Button type="submit" loading={loading} className="mt-1 min-h-12 w-full">
              Entrar no portal
              <ArrowRight size={17} />
            </Button>
          </form>

          <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-secondary">
            <LockKeyhole size={13} className="text-subtle" />
            Acesso restrito a usuários autorizados
          </p>
        </section>
      </div>

      <footer className="relative z-10 shrink-0 pt-6 text-center text-xs text-subtle">
        Secretaria Municipal de Saúde <span className="px-1">•</span> v1.0.0
      </footer>
    </main>
  );
}
