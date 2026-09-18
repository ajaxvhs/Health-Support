import { useEffect, useState } from "react";
import { disablePush, enablePush, supportsPush } from "../lib/pushNotifications";
import { useToast } from "../context/useToast";
import { Button } from "./ui";

export function PushNotificationSettings() {
  const [enabled, setEnabled] = useState(false);
  const { showToast } = useToast();
  const supported = supportsPush();
  useEffect(() => {
    if (!supported) return;
    let mounted = true;
    void navigator.serviceWorker
      .getRegistration()
      .then((registration) => registration?.pushManager.getSubscription())
      .then((subscription) => {
        if (mounted) setEnabled(Boolean(subscription));
      })
      .catch(() => {
        /* The explicit activation reports registration errors. */
      });
    return () => {
      mounted = false;
    };
  }, [supported]);
  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-soft sm:p-6">
      <h2 className="font-bold text-ink">Notificações neste dispositivo</h2>
      <p className="mt-3 text-justify text-sm leading-6 text-slate-500">
        Receba avisos de novos chamados e respostas mesmo quando o portal não estiver aberto. A
        disponibilidade depende do dispositivo, navegador e permissões de notificação.
      </p>
      <Button
        className="mt-5 w-full sm:w-auto"
        variant="secondary"
        disabled={!supported}
        onClick={async () => {
          try {
            if (enabled) await disablePush();
            else await enablePush();
            setEnabled(!enabled);
            showToast(
              enabled ? "Notificações desativadas." : "Notificações ativadas neste dispositivo.",
            );
          } catch (error) {
            showToast(
              error instanceof Error ? error.message : "Não foi possível alterar as notificações.",
              "error",
            );
          }
        }}
      >
        {!supported
          ? "Não disponível neste navegador"
          : enabled
            ? "Desativar notificações"
            : "Ativar notificações"}
      </Button>
    </section>
  );
}
