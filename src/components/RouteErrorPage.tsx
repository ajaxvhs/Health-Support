import { useRouteError } from "react-router-dom";
import { isChunkLoadError } from "../lib/chunkRecovery";
import { Button } from "./ui";

export function RouteErrorPage() {
  const error = useRouteError();
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <section className="max-w-md rounded-2xl bg-white p-6 shadow-soft">
        <h1 className="text-xl font-bold text-ink">Não foi possível carregar a página</h1>
        <p className="my-4 text-sm text-slate-500">
          {isChunkLoadError(error)
            ? "Verifique sua conexão. Uma nova versão do portal também pode estar disponível para atualização."
            : "Ocorreu um erro inesperado. Tente carregar a página novamente."}
        </p>
        <Button onClick={() => window.location.reload()}>Tentar novamente</Button>
      </section>
    </main>
  );
}
