export interface PushQueueJob {
  job_id: string;
  subscription_id: string;
  endpoint: string;
}

export interface PushDeliveryDependencies {
  isAllowedEndpoint: (endpoint: string) => boolean;
  send: () => Promise<unknown>;
  deleteQueueJob: (jobId: string) => Promise<void>;
  deleteSubscription: (subscriptionId: string) => Promise<void>;
}

export type PushDeliveryOutcome = "sent" | "invalid_endpoint" | "expired_subscription" | "retry";

export function isAllowedEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      (url.hostname === "fcm.googleapis.com" ||
        url.hostname === "updates.push.services.mozilla.com" ||
        url.hostname === "web.push.apple.com" ||
        url.hostname.endsWith(".notify.windows.com"))
    );
  } catch {
    return false;
  }
}

function statusCode(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("statusCode" in error)) return null;
  return typeof error.statusCode === "number" ? error.statusCode : null;
}

export async function deliverPushJob(
  job: PushQueueJob,
  dependencies: PushDeliveryDependencies,
): Promise<PushDeliveryOutcome> {
  if (!dependencies.isAllowedEndpoint(job.endpoint)) {
    await dependencies.deleteSubscription(job.subscription_id);
    return "invalid_endpoint";
  }

  try {
    await dependencies.send();
  } catch (error) {
    if (statusCode(error) === 404 || statusCode(error) === 410) {
      // push_queue.subscription_id uses ON DELETE CASCADE.
      await dependencies.deleteSubscription(job.subscription_id);
      return "expired_subscription";
    }
    return "retry";
  }

  await dependencies.deleteQueueJob(job.job_id);
  return "sent";
}
