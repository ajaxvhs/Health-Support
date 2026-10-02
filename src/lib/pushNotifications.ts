import { getSupabaseClient } from "./supabase/client";

export type PushSettingsState =
  | { kind: "unsupported"; subscribed: false }
  | { kind: "development-unavailable"; subscribed: false }
  | { kind: "permission-denied"; subscribed: boolean }
  | { kind: "inactive"; subscribed: false; permission: "default" | "granted" }
  | { kind: "active"; subscribed: true }
  | { kind: "sync-error"; subscribed: boolean };

export function shouldShowPushLoginReminder(
  state: PushSettingsState,
): state is Extract<PushSettingsState, { kind: "inactive" }> {
  return state.kind === "inactive";
}

export function supportsPush() {
  if (typeof navigator === "undefined") return false;
  const win =
    typeof window !== "undefined"
      ? (window as unknown as Record<string, unknown>)
      : (globalThis as Record<string, unknown>);
  return "serviceWorker" in navigator && "PushManager" in win && "Notification" in win;
}

export async function getPushSettingsState(): Promise<PushSettingsState> {
  if (!supportsPush()) return { kind: "unsupported", subscribed: false };

  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (import.meta.env.DEV && !subscription)
      return { kind: "development-unavailable", subscribed: false };
    if (Notification.permission === "denied")
      return { kind: "permission-denied", subscribed: false };
    if (Notification.permission !== "granted" || !subscription)
      return {
        kind: "inactive",
        subscribed: false,
        permission: Notification.permission === "granted" ? "granted" : "default",
      };

    const client = getSupabaseClient();
    if (!client) return { kind: "sync-error", subscribed: true };

    const { data, error } = await client
      .from("push_subscriptions")
      .select("id")
      .eq("endpoint", subscription.endpoint)
      .maybeSingle();
    if (error) return { kind: "sync-error", subscribed: true };
    if (data) return { kind: "active", subscribed: true };

    const { data: authData, error: authError } = await client.auth.getUser();
    if (authError || !authData.user) return { kind: "sync-error", subscribed: true };
    const json = subscription.toJSON();
    const { error: upsertError } = await client.from("push_subscriptions").upsert(
      {
        user_id: authData.user.id,
        endpoint: subscription.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
      },
      { onConflict: "endpoint" },
    );
    return upsertError
      ? { kind: "sync-error", subscribed: true }
      : { kind: "active", subscribed: true };
  } catch {
    return { kind: "sync-error", subscribed: false };
  }
}

async function getActiveRegistration(): Promise<ServiceWorkerRegistration> {
  const current = await navigator.serviceWorker.getRegistration();
  if (current?.active) return current;
  if (import.meta.env.DEV && !current)
    throw new Error(
      "O Web Push não está disponível no servidor de desenvolvimento. Use uma versão publicada.",
    );
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
  const registration = await getActiveRegistration();
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
