import { AlertTriangle, Home, RefreshCw } from "lucide-react";
import { Link, useRouteError } from "react-router-dom";
import { isChunkLoadError } from "../lib/chunkRecovery";
import { Button } from "./ui";

export function RouteErrorPage() {
  const error = useRouteError();
  return (
    <main className="relative flex min-h-[100svh] items-center justify-center overflow-hidden bg-canvas-soft px-4 py-8 sm:px-6">
      <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-soft/70 blur-3xl" />
      <div className="absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-info-soft/70 blur-3xl" />
      <section className="relative w-full max-w-xl rounded-3xl border border-line/80 bg-surface/95 p-6 shadow-xl sm:p-9">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-caution-soft text-caution-strong">
          <AlertTriangle size={24} aria-hidden="true" />
        </div>
        <p className="mt-6 text-[11px] font-bold uppercase tracking-[.16em] text-brand">
          Portal de suporte
        </p>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          Não foi possível carregar a página
        </h1>
        <p className="mt-4 max-w-lg text-sm leading-6 text-secondary sm:text-base">
          {isChunkLoadError(error)
            ? "Verifique sua conexão. Uma nova versão do portal pode estar disponível; tente recarregar para continuar."
            : "Ocorreu um erro inesperado ao abrir esta página. Tente novamente ou volte ao início do portal."}
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button className="w-full sm:w-auto" onClick={() => window.location.reload()}>
            <RefreshCw size={16} aria-hidden="true" />
            Tentar novamente
          </Button>
          <Link
            to="/"
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-line-strong px-4 text-sm font-bold text-ink transition hover:border-brand-hover hover:bg-brand-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-focus focus-visible:ring-offset-2 sm:w-auto"
          >
            <Home size={16} aria-hidden="true" />
            Voltar ao início
          </Link>
        </div>
        <p className="mt-6 border-t border-line-soft pt-4 text-xs leading-5 text-subtle">
          Se o problema continuar, feche a aba e abra o portal novamente.
        </p>
      </section>
    </main>
  );
}
