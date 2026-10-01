import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSupabaseClient } from "../../lib/supabase/client";

export function useTicketRealtime(userId: string, ticketId: string | undefined) {
  const queryClient = useQueryClient();
  const [active, setActive] = useState(false);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client || !ticketId) {
      setActive(false);
      return;
    }

    let disposed = false;
    setActive(false);
    const refreshTicket = () => {
      void queryClient.invalidateQueries({ queryKey: ["ticket-detail", userId, ticketId] });
      void queryClient.invalidateQueries({ queryKey: ["ticket-events", userId, ticketId] });
      void queryClient.invalidateQueries({ queryKey: ["ticket-messages", userId, ticketId] });
      void queryClient.invalidateQueries({ queryKey: ["ticket-pages", userId] });
      void queryClient.invalidateQueries({ queryKey: ["ticket-dashboard", userId] });
      void queryClient.invalidateQueries({ queryKey: ["ticket-navigation-counts", userId] });
    };
    const channel = client
      .channel(`ticket:${ticketId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tickets", filter: `id=eq.${ticketId}` },
        refreshTicket,
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ticket_messages",
          filter: `ticket_id=eq.${ticketId}`,
        },
        refreshTicket,
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "ticket_events",
          filter: `ticket_id=eq.${ticketId}`,
        },
        refreshTicket,
      )
      .subscribe((status) => {
        if (disposed) return;
        setActive(status === "SUBSCRIBED");
      });

    return () => {
      disposed = true;
      setActive(false);
      void client.removeChannel(channel);
    };
  }, [queryClient, ticketId, userId]);

  return active;
}
