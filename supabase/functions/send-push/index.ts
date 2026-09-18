import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

function allowedEndpoint(endpoint: string) {
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
      if (!allowedEndpoint(job.endpoint)) {
        await client.from("push_subscriptions").delete().eq("id", job.subscription_id);
        continue;
      }
      try {
        await webpush.sendNotification(
          { endpoint: job.endpoint, keys: { p256dh: job.p256dh, auth: job.auth } },
          "{}",
          { TTL: 3600, timeout: 5000 },
        );
        const { error: deleteError } = await client
          .from("push_queue")
          .delete()
          .eq("id", job.job_id);
        if (deleteError) throw deleteError;
        sent++;
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "statusCode" in error &&
          (error.statusCode === 404 || error.statusCode === 410)
        ) {
          await client.from("push_subscriptions").delete().eq("id", job.subscription_id);
        }
        // Other failures remain leased for retry. Never log endpoints or keys.
      }
    }
    return Response.json({ sent });
  } catch {
    return new Response("Push dispatch unavailable", { status: 503 });
  }
});
