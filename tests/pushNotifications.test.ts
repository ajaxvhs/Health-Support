import { afterEach, describe, expect, it, vi } from "vitest";
import { disablePush, enablePush } from "../src/lib/pushNotifications";

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
  it("does not register a device when permission is denied", async () => {
    vi.stubEnv("VITE_VAPID_PUBLIC_KEY", "key");
    vi.stubGlobal("Notification", { requestPermission: vi.fn().mockResolvedValue("denied") });
    vi.stubGlobal("window", { PushManager: {}, Notification: {} });
    vi.stubGlobal("navigator", { serviceWorker: {} });
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

  it("rejects a misconfigured VAPID key before touching the service worker", async () => {
    vi.stubEnv("VITE_VAPID_PUBLIC_KEY", "short");
    vi.stubGlobal("Notification", { requestPermission: vi.fn().mockResolvedValue("granted") });
    vi.stubGlobal("window", { PushManager: {}, Notification: {} });
    const getRegistration = vi.fn();
    vi.stubGlobal("navigator", { serviceWorker: { getRegistration } });
    await expect(enablePush()).rejects.toThrow("configuradas");
    expect(getRegistration).not.toHaveBeenCalled();
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
