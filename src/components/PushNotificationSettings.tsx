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
    <section className="mb-6 max-w-3xl rounded-2xl border border-slate-100 bg-white p-5 shadow-soft">
      <h2 className="font-bold text-ink">Notificações neste dispositivo</h2>
      <p className="mt-2 text-sm text-slate-500">
        Receba avisos de novos chamados e respostas, mesmo com o portal fechado. No iPhone, adicione
        o portal à Tela de Início pelo Safari e abra o aplicativo instalado.
      </p>
      <Button
        className="mt-4"
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
