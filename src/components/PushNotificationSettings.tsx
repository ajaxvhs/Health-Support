import { useEffect, useState } from "react";
import {
  disablePush,
  enablePush,
  getPushSettingsState,
  supportsPush,
  type PushSettingsState,
} from "../lib/pushNotifications";
import { useToast } from "../context/useToast";
import { errorMessage } from "../lib/utils";
import { Button } from "./ui";

export function PushNotificationSettings() {
  const [state, setState] = useState<PushSettingsState>({
    kind: "inactive",
    subscribed: false,
    permission: "default",
  });
  const [checking, setChecking] = useState(true);
  const [updating, setUpdating] = useState(false);
  const { showToast } = useToast();
  const supported = supportsPush();
  useEffect(() => {
    let mounted = true;
    void getPushSettingsState().then((nextState) => {
      if (!mounted) return;
      setState(nextState);
      setChecking(false);
    });
    return () => {
      mounted = false;
    };
  }, []);

  const handleClick = async () => {
    setUpdating(true);
    try {
      if (state.kind === "sync-error") {
        const nextState = await getPushSettingsState();
        setState(nextState);
        if (nextState.kind === "sync-error")
          showToast("Não foi possível sincronizar este dispositivo agora.", "error");
        return;
      }
      if (state.subscribed) {
        await disablePush();
        setState(await getPushSettingsState());
        showToast("Notificações desativadas.");
      } else {
        await enablePush();
        setState({ kind: "active", subscribed: true });
        showToast("Notificações ativadas neste dispositivo.");
      }
    } catch (error) {
      showToast(errorMessage(error, "Não foi possível alterar as notificações."), "error");
    } finally {
      setUpdating(false);
    }
  };

  const buttonLabel = !supported
    ? "Não disponível neste navegador"
    : checking
      ? "Verificando notificações…"
      : state.kind === "development-unavailable"
        ? "Disponível apenas na versão publicada"
        : state.kind === "permission-denied" && !state.subscribed
          ? "Permissão bloqueada no navegador"
          : state.kind === "sync-error"
            ? "Tentar sincronizar"
            : state.kind === "inactive" && state.permission === "granted"
              ? "Reativar notificações"
              : state.subscribed
                ? "Desativar notificações"
                : "Ativar notificações";

  return (
    <section
      aria-busy={checking || updating}
      className="rounded-2xl border border-line-soft bg-surface p-5 shadow-soft sm:p-6"
    >
      <h2 className="font-bold text-ink">Notificações neste dispositivo</h2>
      <p className="mt-3 text-justify text-sm leading-6 text-muted">
        Receba avisos de novos chamados e respostas mesmo quando o portal não estiver aberto. A
        disponibilidade depende do dispositivo, navegador e permissões de notificação.
      </p>
      {state.kind === "permission-denied" && (
        <p className="mt-3 text-sm text-muted" role="status">
          A permissão foi bloqueada. Altere-a nas configurações do navegador para receber avisos.
        </p>
      )}
      {state.kind === "inactive" && state.permission === "granted" && (
        <p className="mt-3 text-justify text-sm leading-6 text-muted" role="status">
          A permissão do navegador está concedida, mas este dispositivo ainda não está inscrito para
          receber notificações. Reative para concluir a configuração sem um novo pedido de
          permissão.
        </p>
      )}
      {state.kind === "development-unavailable" && (
        <p className="mt-3 text-sm text-muted" role="status">
          A permissão do navegador pode estar ativa, mas o servidor de desenvolvimento não tem o
          service worker e a configuração necessários para criar uma inscrição Push.
        </p>
      )}
      {state.kind === "sync-error" && (
        <p className="mt-3 text-sm text-muted" role="status">
          Não foi possível confirmar o estado das notificações. Tente sincronizar novamente.
        </p>
      )}
      <Button
        className="mt-5 w-full sm:w-auto"
        variant="secondary"
        disabled={
          !supported ||
          checking ||
          updating ||
          state.kind === "development-unavailable" ||
          (state.kind === "permission-denied" && !state.subscribed)
        }
        onClick={handleClick}
      >
        {updating ? "Atualizando…" : buttonLabel}
      </Button>
    </section>
  );
}
