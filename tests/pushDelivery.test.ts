import { describe, expect, it, vi } from "vitest";
import {
  deliverPushJob,
  isAllowedEndpoint,
  type PushDeliveryDependencies,
  type PushQueueJob,
} from "../supabase/functions/_shared/pushDelivery";

const job: PushQueueJob = {
  job_id: "job-local",
  subscription_id: "subscription-local",
  endpoint: "https://fcm.googleapis.com/push/local-test",
};

function deliveryDependencies(overrides: Partial<PushDeliveryDependencies> = {}) {
  return {
    isAllowedEndpoint: vi.fn(() => true),
    send: vi.fn(async () => undefined),
    deleteQueueJob: vi.fn(async () => undefined),
    deleteSubscription: vi.fn(async () => undefined),
    ...overrides,
  } satisfies PushDeliveryDependencies;
}

describe("resultado de entrega de Web Push", () => {
  it("remove o job depois de um envio confirmado", async () => {
    const deps = deliveryDependencies();

    const result = await deliverPushJob(job, deps);

    expect(result).toBe("sent");
    expect(deps.send).toHaveBeenCalledOnce();
    expect(deps.deleteQueueJob).toHaveBeenCalledWith(job.job_id);
    expect(deps.deleteSubscription).not.toHaveBeenCalled();
  });

  it("remove a inscricao invalida e deixa o FK limpar o job associado", async () => {
    const deps = deliveryDependencies({ isAllowedEndpoint: vi.fn(() => false) });

    const result = await deliverPushJob(job, deps);

    expect(result).toBe("invalid_endpoint");
    expect(deps.send).not.toHaveBeenCalled();
    expect(deps.deleteSubscription).toHaveBeenCalledWith(job.subscription_id);
    expect(deps.deleteQueueJob).not.toHaveBeenCalled();
  });

  it.each([404, 410])("remove uma inscricao expirada com status %i", async (statusCode) => {
    const send = vi.fn(async () => {
      throw Object.assign(new Error("push endpoint expired"), { statusCode });
    });
    const deps = deliveryDependencies({ send });

    const result = await deliverPushJob(job, deps);

    expect(result).toBe("expired_subscription");
    expect(deps.deleteSubscription).toHaveBeenCalledWith(job.subscription_id);
    expect(deps.deleteQueueJob).not.toHaveBeenCalled();
  });

  it.each([
    ["network interruption", new TypeError("network unavailable")],
    [
      "transient server failure",
      Object.assign(new Error("temporarily unavailable"), { statusCode: 503 }),
    ],
  ])("leaves %s leased for retry", async (_name, error) => {
    const send = vi.fn(async () => {
      throw error;
    });
    const deps = deliveryDependencies({ send });

    const result = await deliverPushJob(job, deps);

    expect(result).toBe("retry");
    expect(deps.deleteSubscription).not.toHaveBeenCalled();
    expect(deps.deleteQueueJob).not.toHaveBeenCalled();
  });

  it("accepts only secure endpoints from supported push services", () => {
    expect(isAllowedEndpoint("https://fcm.googleapis.com/push/local-test")).toBe(true);
    expect(isAllowedEndpoint("http://fcm.googleapis.com/push/local-test")).toBe(false);
    expect(isAllowedEndpoint("https://example.invalid/push/local-test")).toBe(false);
    expect(isAllowedEndpoint("not a URL")).toBe(false);
  });
});
