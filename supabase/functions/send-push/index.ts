import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { deliverPushJob, isAllowedEndpoint } from "../_shared/pushDelivery.ts";

Deno.serve(async (request) => {
  const secret = Deno.env.get("PUSH_DISPATCH_SECRET");
  if (!secret || request.headers.get("Authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    webpush.setVapidDetails(
      Deno.env.get("VAPID_SUBJECT"),
      Deno.env.get("VAPID_PUBLIC_KEY"),
      Deno.env.get("VAPID_PRIVATE_KEY"),
    );
    const client = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    );
    const { data: jobs, error } = await client.rpc("claim_push_jobs");
    if (error) throw error;
    let sent = 0;
    for (const job of jobs) {
      try {
        const outcome = await deliverPushJob(job, {
          isAllowedEndpoint,
          send: () =>
            webpush.sendNotification(
              { endpoint: job.endpoint, keys: { p256dh: job.p256dh, auth: job.auth } },
              JSON.stringify({
                title: job.notification_title,
                body: job.notification_message,
                ticketId: job.ticket_id,
              }),
              { TTL: 3600, timeout: 5000 },
            ),
          deleteQueueJob: async (jobId) => {
            const { error: deleteError } = await client.from("push_queue").delete().eq("id", jobId);
            if (deleteError) throw deleteError;
          },
          deleteSubscription: async (subscriptionId) => {
            const { error: deleteError } = await client
              .from("push_subscriptions")
              .delete()
              .eq("id", subscriptionId);
            if (deleteError) throw deleteError;
          },
        });
        if (outcome === "sent") sent++;
      } catch {
        // Leave failed database acknowledgements leased for a later retry; never log endpoints or keys.
      }
    }
    return Response.json({ sent });
  } catch {
    return new Response("Push dispatch unavailable", { status: 503 });
  }
});
