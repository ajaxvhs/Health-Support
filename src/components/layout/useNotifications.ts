import { useEffect, useState } from "react";
import type { AppNotification } from "../../types";
import type { SupabaseRepository } from "../../lib/repository";
import { errorMessage } from "../../lib/utils";
import { getSupabaseClient } from "../../lib/supabase/client";

export function useNotifications(
  repo: SupabaseRepository,
  userId: string,
  showToast: (message: string, kind?: "success" | "error" | "info") => void,
) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  useEffect(() => {
    let active = true;
    const client = getSupabaseClient();
    const refreshNotifications = async (announce = false, title?: string) => {
      try {
        const items = await repo.getNotifications(userId);
        if (!active) return;
        setNotifications(items);
        if (announce) showToast(title ?? "Nova notificação recebida.", "info");
      } catch (reason) {
        if (active)
          showToast(errorMessage(reason, "Não foi possível atualizar as notificações."), "error");
      }
    };
    repo
      .getNotifications(userId)
      .then((items) => {
        if (active) setNotifications(items);
      })
      .catch((reason) => {
        if (active)
          showToast(errorMessage(reason, "Não foi possível carregar as notificações."), "error");
      });
    if (!client)
      return () => {
        active = false;
      };
    const channel = client
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as { title?: string };
          void refreshNotifications(true, row.title);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => void refreshNotifications(),
      )
      .subscribe();
    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  }, [repo, showToast, userId]);

  const markRead = async (notification: AppNotification) => {
    try {
      await repo.markNotificationRead(userId, notification.id);
      setNotifications((items) =>
        items.map((item) => (item.id === notification.id ? { ...item, read: true } : item)),
      );
    } catch (reason) {
      showToast(errorMessage(reason, "Não foi possível atualizar a notificação."), "error");
    }
  };

  const markAll = async () => {
    try {
      await repo.markAllNotificationsRead(userId);
      setNotifications((items) => items.map((item) => ({ ...item, read: true })));
      showToast("Todas as notificações foram marcadas como lidas.");
    } catch (reason) {
      showToast(errorMessage(reason, "Não foi possível atualizar as notificações."), "error");
    }
  };

  const remove = async (notification: AppNotification) => {
    try {
      await repo.deleteNotification(userId, notification.id);
      setNotifications((items) => items.filter((item) => item.id !== notification.id));
      showToast("Notificação excluída.");
    } catch (reason) {
      showToast(errorMessage(reason, "Não foi possível excluir a notificação."), "error");
    }
  };

  const removeAll = async () => {
    try {
      await repo.deleteAllNotifications(userId);
      setNotifications([]);
      showToast("Notificações excluídas.");
    } catch (reason) {
      showToast(errorMessage(reason, "Não foi possível excluir as notificações."), "error");
    }
  };

  return { notifications, markRead, markAll, remove, removeAll };
}
