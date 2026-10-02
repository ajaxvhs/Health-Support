import { afterEach, describe, expect, it, vi } from "vitest";
import {
  disablePush,
  enablePush,
  getPushSettingsState,
  shouldShowPushLoginReminder,
} from "../src/lib/pushNotifications";

const client = vi.hoisted(() => ({
  auth: { getUser: vi.fn() },
  from: vi.fn(),
}));
vi.mock("../src/lib/supabase/client", () => ({ getSupabaseClient: () => client }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe("push device lifecycle", () => {
  it("only suggests activation after login when the device has no subscription", () => {
    expect(
      shouldShowPushLoginReminder({ kind: "inactive", subscribed: false, permission: "default" }),
    ).toBe(true);
    expect(
      shouldShowPushLoginReminder({ kind: "inactive", subscribed: false, permission: "granted" }),
    ).toBe(true);
    expect(shouldShowPushLoginReminder({ kind: "active", subscribed: true })).toBe(false);
    expect(shouldShowPushLoginReminder({ kind: "sync-error", subscribed: false })).toBe(false);
    expect(
      shouldShowPushLoginReminder({ kind: "development-unavailable", subscribed: false }),
    ).toBe(false);
  });

  it("recognizes an existing local and remote subscription without requesting permission", async () => {
    const subscription = {
      endpoint: "https://example.invalid/push",
      toJSON: () => ({ keys: { p256dh: "key", auth: "key" } }),
    };
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: { endpoint: subscription.endpoint }, error: null });
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle,
    };
    const requestPermission = vi.fn();
    vi.stubGlobal("Notification", { permission: "granted", requestPermission });
    vi.stubGlobal("window", { PushManager: {}, Notification: {} });
    vi.stubGlobal("navigator", {
      serviceWorker: {
        getRegistration: vi.fn().mockResolvedValue({
          pushManager: { getSubscription: vi.fn().mockResolvedValue(subscription) },
        }),
      },
    });
    client.from.mockReturnValue(query);

    await expect(getPushSettingsState()).resolves.toEqual({ kind: "active", subscribed: true });
    expect(maybeSingle).toHaveBeenCalledOnce();
    expect(requestPermission).not.toHaveBeenCalled();
    expect(client.auth.getUser).not.toHaveBeenCalled();
  });

  it("restores a missing remote registration from the existing local subscription", async () => {
    const subscription = {
      endpoint: "https://example.invalid/push",
      toJSON: () => ({ keys: { p256dh: "public-key", auth: "auth-key" } }),
    };
    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle,
      upsert,
    };
    vi.stubGlobal("Notification", { permission: "granted", requestPermission: vi.fn() });
    vi.stubGlobal("window", { PushManager: {}, Notification: {} });
    vi.stubGlobal("navigator", {
      serviceWorker: {
        getRegistration: vi.fn().mockResolvedValue({
          pushManager: { getSubscription: vi.fn().mockResolvedValue(subscription) },
        }),
      },
    });
    client.auth.getUser.mockResolvedValue({ data: { user: { id: "current-user" } } });
    client.from.mockReturnValue(query);

    await expect(getPushSettingsState()).resolves.toEqual({ kind: "active", subscribed: true });
    expect(client.auth.getUser).toHaveBeenCalledOnce();
    expect(upsert).toHaveBeenCalledWith(
      {
        user_id: "current-user",
        endpoint: subscription.endpoint,
        p256dh: "public-key",
        auth: "auth-key",
      },
      { onConflict: "endpoint" },
    );
  });

  it("does not treat a subscription as active when browser permission is denied", async () => {
    vi.stubGlobal("Notification", { permission: "denied", requestPermission: vi.fn() });
    vi.stubGlobal("window", { PushManager: {}, Notification: {} });
    vi.stubGlobal("navigator", {
      serviceWorker: {
        getRegistration: vi.fn().mockResolvedValue({
          pushManager: {
            getSubscription: vi
              .fn()
              .mockResolvedValue({ endpoint: "https://example.invalid/push" }),
          },
        }),
      },
    });

    await expect(getPushSettingsState()).resolves.toEqual({
      kind: "permission-denied",
      subscribed: false,
    });
    expect(client.from).not.toHaveBeenCalled();
  });

  it("does not contact Supabase when no local subscription exists", async () => {
    vi.stubEnv("DEV", false);
    vi.stubGlobal("Notification", { permission: "default", requestPermission: vi.fn() });
    vi.stubGlobal("window", { PushManager: {}, Notification: {} });
    vi.stubGlobal("navigator", {
      serviceWorker: {
        getRegistration: vi.fn().mockResolvedValue({
          active: {},
          pushManager: { getSubscription: vi.fn().mockResolvedValue(null) },
        }),
      },
    });

    await expect(getPushSettingsState()).resolves.toEqual({
      kind: "inactive",
      subscribed: false,
      permission: "default",
    });
    expect(client.from).not.toHaveBeenCalled();
  });

  it("distinguishes granted browser permission from a missing device subscription", async () => {
    vi.stubEnv("DEV", false);
    vi.stubGlobal("Notification", { permission: "granted", requestPermission: vi.fn() });
    vi.stubGlobal("window", { PushManager: {}, Notification: {} });
    vi.stubGlobal("navigator", {
      serviceWorker: {
        getRegistration: vi.fn().mockResolvedValue({
          active: {},
          pushManager: { getSubscription: vi.fn().mockResolvedValue(null) },
        }),
      },
    });

    await expect(getPushSettingsState()).resolves.toEqual({
      kind: "inactive",
      subscribed: false,
      permission: "granted",
    });
    expect(client.from).not.toHaveBeenCalled();
  });

  it("explains that Push is unavailable in development without an active worker", async () => {
    vi.stubGlobal("Notification", { permission: "granted", requestPermission: vi.fn() });
    vi.stubGlobal("window", { PushManager: {}, Notification: {} });
    vi.stubGlobal("navigator", {
      serviceWorker: { getRegistration: vi.fn().mockResolvedValue(undefined) },
    });

    await expect(getPushSettingsState()).resolves.toEqual({
      kind: "development-unavailable",
      subscribed: false,
    });
    expect(client.from).not.toHaveBeenCalled();
  });

  it("does not ask for notification permission when development has no service worker", async () => {
    vi.stubEnv("DEV", true);
    const requestPermission = vi.fn();
    vi.stubGlobal("Notification", { permission: "granted", requestPermission });
    vi.stubGlobal("window", { PushManager: {}, Notification: {} });
    vi.stubGlobal("navigator", {
      serviceWorker: { getRegistration: vi.fn().mockResolvedValue(undefined) },
    });

    await expect(enablePush()).rejects.toThrow("servidor de desenvolvimento");
    expect(requestPermission).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalled();
  });

  it("does not register a device when permission is denied", async () => {
    vi.stubEnv("VITE_VAPID_PUBLIC_KEY", "key");
    vi.stubGlobal("Notification", { requestPermission: vi.fn().mockResolvedValue("denied") });
    vi.stubGlobal("window", { PushManager: {}, Notification: {} });
    vi.stubGlobal("navigator", {
      serviceWorker: {
        getRegistration: vi.fn().mockResolvedValue({ active: {}, pushManager: {} }),
      },
    });
    await expect(enablePush()).rejects.toThrow("Permita notificações");
    expect(client.from).not.toHaveBeenCalled();
  });

  it("unsubscribes a device when persisting the registration fails", async () => {
    vi.stubEnv("VITE_VAPID_PUBLIC_KEY", `B${"A".repeat(86)}`);
    vi.stubGlobal("Notification", { requestPermission: vi.fn().mockResolvedValue("granted") });
    vi.stubGlobal("window", { PushManager: {}, Notification: {} });
    const unsubscribe = vi.fn().mockResolvedValue(true);
    vi.stubGlobal("navigator", {
      serviceWorker: {
        getRegistration: vi.fn().mockResolvedValue({
          active: {},
          pushManager: {
            subscribe: vi.fn().mockResolvedValue({
              endpoint: "https://example.invalid/push",
              toJSON: () => ({ keys: { p256dh: "key", auth: "key" } }),
              unsubscribe,
            }),
          },
        }),
      },
    });
    client.auth.getUser.mockResolvedValue({ data: { user: { id: "test-user" } } });
    client.from.mockReturnValue({
      upsert: vi.fn().mockResolvedValue({ error: new Error("Denied") }),
    });
    await expect(enablePush()).rejects.toThrow("Não foi possível registrar");
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("waits for the service worker when it is still installing", async () => {
    vi.stubGlobal("Notification", { requestPermission: vi.fn().mockResolvedValue("granted") });
    vi.stubGlobal("window", { PushManager: {}, Notification: {} });
    const subscribe = vi.fn().mockResolvedValue({
      endpoint: "https://example.invalid/push",
      toJSON: () => ({ keys: { p256dh: "key", auth: "key" } }),
    });
    const activeRegistration = { active: {}, pushManager: { subscribe } };
    vi.stubGlobal("navigator", {
      serviceWorker: {
        getRegistration: vi
          .fn()
          .mockResolvedValueOnce({ active: null })
          .mockResolvedValueOnce(activeRegistration),
        ready: Promise.resolve(activeRegistration),
      },
    });
    const validKey = `B${"A".repeat(86)}`;
    vi.stubEnv("VITE_VAPID_PUBLIC_KEY", validKey);
    client.auth.getUser.mockResolvedValue({ data: { user: { id: "test-user" } } });
    client.from.mockReturnValue({ upsert: vi.fn().mockResolvedValue({ error: null }) });
    await expect(enablePush()).resolves.toBeUndefined();
    expect(subscribe).toHaveBeenCalledOnce();
  });

  it("rejects a misconfigured VAPID key after confirming the worker is ready", async () => {
    vi.stubEnv("VITE_VAPID_PUBLIC_KEY", "short");
    vi.stubGlobal("Notification", { requestPermission: vi.fn().mockResolvedValue("granted") });
    vi.stubGlobal("window", { PushManager: {}, Notification: {} });
    const getRegistration = vi.fn().mockResolvedValue({ active: {}, pushManager: {} });
    vi.stubGlobal("navigator", { serviceWorker: { getRegistration } });
    await expect(enablePush()).rejects.toThrow("configuradas");
    expect(getRegistration).toHaveBeenCalledOnce();
  });

  it("stops browser delivery before deleting the server subscription", async () => {
    const order: string[] = [];
    vi.stubGlobal("window", { PushManager: {}, Notification: {} });
    vi.stubGlobal("navigator", {
      serviceWorker: {
        getRegistration: vi.fn().mockResolvedValue({
          pushManager: {
            getSubscription: vi.fn().mockResolvedValue({
              endpoint: "https://example.invalid/push",
              unsubscribe: async () => {
                order.push("browser");
                return true;
              },
            }),
          },
        }),
      },
    });
    client.from.mockReturnValue({
      delete: () => ({
        eq: async () => {
          order.push("database");
        },
      }),
    });
    await disablePush();
    expect(order).toEqual(["browser", "database"]);
  });
});
