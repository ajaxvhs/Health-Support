import { getSupabaseClient } from "./supabase/client";

export function supportsPush() {
  if (typeof navigator === "undefined") return false;
  const win =
    typeof window !== "undefined"
      ? (window as unknown as Record<string, unknown>)
      : (globalThis as Record<string, unknown>);
  return "serviceWorker" in navigator && "PushManager" in win && "Notification" in win;
}

async function getActiveRegistration(): Promise<ServiceWorkerRegistration> {
  const current = await navigator.serviceWorker.getRegistration();
  if (current?.active) return current;
  // The worker may still be installing on first load; wait for activation.
  const ready = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), 8000)),
  ]);
  if (ready) return ready;
  const retry = await navigator.serviceWorker.getRegistration();
  if (retry?.active) return retry;
  throw new Error(
    import.meta.env.DEV
      ? "Notificações disponíveis apenas em versões publicadas."
      : "Não foi possível preparar as notificações agora. Aguarde alguns segundos e tente novamente.",
  );
}

export async function enablePush() {
  if (!supportsPush()) throw new Error("Este navegador não oferece suporte a notificações.");
  const client = getSupabaseClient();
  if (!client) throw new Error("Serviço indisponível.");
  if ((await Notification.requestPermission()) !== "granted") {
    throw new Error("Permita notificações nas configurações do navegador para ativar os avisos.");
  }
  let key = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (!key) {
    const { data: config, error } = await client
      .from("push_public_config")
      .select("vapid_public_key")
      .eq("singleton", true)
      .single();
    if (error || !config?.vapid_public_key) {
      throw new Error("As notificações ainda não foram configuradas neste ambiente.");
    }
    key = config.vapid_public_key as string;
  }
  const base64 = key.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  let decoded: string;
  try {
    decoded = atob(padded);
  } catch {
    throw new Error("As notificações ainda não foram configuradas neste ambiente.");
  }
  if (decoded.length !== 65 || decoded.charCodeAt(0) !== 4)
    throw new Error("As notificações ainda não foram configuradas neste ambiente.");
  const registration = await getActiveRegistration();
  const { data, error: authError } = await client.auth.getUser();
  if (authError || !data.user) throw new Error("Entre novamente para ativar notificações.");
  let subscription: PushSubscription;
  try {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: Uint8Array.from(decoded, (char) => char.charCodeAt(0)),
    });
  } catch {
    throw new Error(
      "Não foi possível concluir a ativação neste navegador. Verifique a conexão e tente novamente.",
    );
  }
  const json = subscription.toJSON();
  const { error } = await client.from("push_subscriptions").upsert(
    {
      user_id: data.user.id,
      endpoint: subscription.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
    },
    { onConflict: "endpoint" },
  );
  if (error) {
    await subscription.unsubscribe();
    throw new Error("Não foi possível registrar este dispositivo. Tente novamente.");
  }
}

export async function disablePush() {
  if (!supportsPush()) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  // Stop browser delivery even if the connection to the database is unavailable.
  const removed = await subscription.unsubscribe();
  if (!removed) throw new Error("Não foi possível desativar as notificações neste dispositivo.");
  await getSupabaseClient()
    ?.from("push_subscriptions")
    .delete()
    .eq("endpoint", subscription.endpoint);
}
