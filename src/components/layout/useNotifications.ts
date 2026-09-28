import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import type { AppNotification } from "../../types";
import type { SupabaseRepository } from "../../lib/repository";
import { errorMessage } from "../../lib/utils";
import { getSupabaseClient } from "../../lib/supabase/client";
import { queryCache } from "../../lib/queryCache";

const NOTIFICATION_PAGE_SIZE = 50;

export function useNotifications(
  repo: SupabaseRepository,
  userId: string,
  showToast: (message: string, kind?: "success" | "error" | "info") => void,
) {
  const queryClient = useQueryClient();
  const notificationsKey = useMemo(() => ["notifications", userId] as const, [userId]);
  const unreadCountKey = useMemo(() => ["notification-unread-count", userId] as const, [userId]);
  const countSyncTimer = useRef<number | undefined>(undefined);
  const deletionSyncTimer = useRef<number | undefined>(undefined);

  const notificationsQuery = useInfiniteQuery({
    queryKey: notificationsKey,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => repo.getNotifications(userId, pageParam, NOTIFICATION_PAGE_SIZE),
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === NOTIFICATION_PAGE_SIZE
        ? new Set(pages.flat().map((notification) => notification.id)).size
        : undefined,
    ...queryCache.notifications,
  });
  const unreadCountQuery = useQuery({
    queryKey: unreadCountKey,
    queryFn: () => repo.getUnreadNotificationCount(userId),
    ...queryCache.notificationUnreadCount,
  });
  const notifications = useMemo(() => {
    const seen = new Set<string>();
    return (notificationsQuery.data?.pages.flat() ?? []).filter((notification) => {
      if (seen.has(notification.id)) return false;
      seen.add(notification.id);
      return true;
    });
  }, [notificationsQuery.data]);
  const unreadCount = unreadCountQuery.data ?? 0;

  const scheduleCountSync = useCallback(() => {
    window.clearTimeout(countSyncTimer.current);
    countSyncTimer.current = window.setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: unreadCountKey });
    }, 100);
  }, [queryClient, unreadCountKey]);
  const scheduleDeletionSync = useCallback(() => {
    window.clearTimeout(deletionSyncTimer.current);
    deletionSyncTimer.current = window.setTimeout(() => {
      void queryClient.invalidateQueries({ queryKey: notificationsKey });
      void queryClient.invalidateQueries({ queryKey: unreadCountKey });
    }, 100);
  }, [notificationsKey, queryClient, unreadCountKey]);

  useEffect(() => {
    if (notificationsQuery.error)
      showToast(
        errorMessage(notificationsQuery.error, "Não foi possível carregar as notificações."),
        "error",
      );
  }, [notificationsQuery.error, showToast]);
  useEffect(() => {
    if (unreadCountQuery.error)
      showToast(
        errorMessage(unreadCountQuery.error, "Não foi possível atualizar a contagem."),
        "error",
      );
  }, [showToast, unreadCountQuery.error]);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) return;
    let hasSubscribed = false;
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
          const notification = repo.mapNotification(payload.new as Record<string, unknown>);
          if (!notification || notification.userId !== userId) return;
          let wasKnown = false;
          queryClient.setQueryData<InfiniteData<AppNotification[], number>>(
            notificationsKey,
            (current) => {
              if (!current?.pages.length) return current;
              wasKnown = current.pages.some((page) =>
                page.some((item) => item.id === notification.id),
              );
              const pages = [...current.pages];
              pages[0] = [notification, ...pages[0].filter((item) => item.id !== notification.id)];
              return { ...current, pages };
            },
          );
          if (!wasKnown) {
            if (!notification.read) {
              if (queryClient.getQueryData(unreadCountKey) === undefined) scheduleCountSync();
              else
                queryClient.setQueryData<number>(unreadCountKey, (count) =>
                  count === undefined ? count : count + 1,
                );
            }
            if (!queryClient.getQueryData(notificationsKey))
              void queryClient.invalidateQueries({ queryKey: notificationsKey });
            showToast(notification.title || "Nova notificação recebida.", "info");
          }
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
        (payload) => {
          const notification = repo.mapNotification(payload.new as Record<string, unknown>);
          if (!notification || notification.userId !== userId) return;
          queryClient.setQueryData<InfiniteData<AppNotification[], number>>(
            notificationsKey,
            (current) =>
              current
                ? {
                    ...current,
                    pages: current.pages.map((page) =>
                      page.map((item) => (item.id === notification.id ? notification : item)),
                    ),
                  }
                : current,
          );
          scheduleCountSync();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const id = (payload.old as { id?: string }).id;
          if (!id) return;
          let wasUnread = false;
          queryClient.setQueryData<InfiniteData<AppNotification[], number>>(
            notificationsKey,
            (current) => {
              if (!current) return current;
              const deleted = current.pages.flat().find((item) => item.id === id);
              wasUnread = deleted?.read === false;
              return {
                ...current,
                pages: current.pages.map((page) => page.filter((item) => item.id !== id)),
              };
            },
          );
          if (wasUnread)
            queryClient.setQueryData<number>(unreadCountKey, (count) =>
              count === undefined ? count : Math.max(0, count - 1),
            );
          scheduleDeletionSync();
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          if (hasSubscribed) {
            void queryClient.invalidateQueries({ queryKey: notificationsKey });
            void queryClient.invalidateQueries({ queryKey: unreadCountKey });
          }
          hasSubscribed = true;
        }
      });
    return () => {
      window.clearTimeout(countSyncTimer.current);
      window.clearTimeout(deletionSyncTimer.current);
      void client.removeChannel(channel);
    };
  }, [
    notificationsKey,
    queryClient,
    repo,
    scheduleCountSync,
    scheduleDeletionSync,
    showToast,
    unreadCountKey,
    userId,
  ]);

  const loadMore = async () => {
    const result = await notificationsQuery.fetchNextPage();
    if (result.isError)
      showToast(
        errorMessage(result.error, "Não foi possível carregar notificações antigas."),
        "error",
      );
  };

  const markRead = async (notification: AppNotification) => {
    try {
      await repo.markNotificationRead(userId, notification.id);
      queryClient.setQueryData<InfiniteData<AppNotification[], number>>(
        notificationsKey,
        (current) =>
          current
            ? {
                ...current,
                pages: current.pages.map((page) =>
                  page.map((item) =>
                    item.id === notification.id ? { ...item, read: true } : item,
                  ),
                ),
              }
            : current,
      );
      if (!notification.read)
        queryClient.setQueryData<number>(unreadCountKey, (count) =>
          count === undefined ? count : Math.max(0, count - 1),
        );
      void queryClient.invalidateQueries({ queryKey: notificationsKey });
    } catch (reason) {
      showToast(errorMessage(reason, "Não foi possível atualizar a notificação."), "error");
    }
  };

  const markAll = async () => {
    try {
      await repo.markAllNotificationsRead(userId);
      queryClient.setQueryData<InfiniteData<AppNotification[], number>>(
        notificationsKey,
        (current) =>
          current
            ? {
                ...current,
                pages: current.pages.map((page) => page.map((item) => ({ ...item, read: true }))),
              }
            : current,
      );
      queryClient.setQueryData(unreadCountKey, 0);
      void queryClient.invalidateQueries({ queryKey: notificationsKey });
      showToast("Todas as notificações foram marcadas como lidas.");
    } catch (reason) {
      showToast(errorMessage(reason, "Não foi possível atualizar as notificações."), "error");
    }
  };

  const remove = async (notification: AppNotification) => {
    try {
      await repo.deleteNotification(userId, notification.id);
      queryClient.setQueryData<InfiniteData<AppNotification[], number>>(
        notificationsKey,
        (current) =>
          current
            ? {
                ...current,
                pages: current.pages.map((page) =>
                  page.filter((item) => item.id !== notification.id),
                ),
              }
            : current,
      );
      if (!notification.read)
        queryClient.setQueryData<number>(unreadCountKey, (count) =>
          count === undefined ? count : Math.max(0, count - 1),
        );
      showToast("Notificação excluída.");
    } catch (reason) {
      showToast(errorMessage(reason, "Não foi possível excluir a notificação."), "error");
    }
  };

  const removeAll = async () => {
    try {
      await repo.deleteAllNotifications(userId);
      queryClient.setQueryData<InfiniteData<AppNotification[], number>>(notificationsKey, {
        pages: [[]],
        pageParams: [0],
      });
      queryClient.setQueryData(unreadCountKey, 0);
      showToast("Notificações excluídas.");
    } catch (reason) {
      showToast(errorMessage(reason, "Não foi possível excluir as notificações."), "error");
    }
  };

  return {
    notifications,
    unreadCount,
    hasMore: Boolean(notificationsQuery.hasNextPage),
    isLoadingMore: notificationsQuery.isFetchingNextPage,
    loadMore,
    markRead,
    markAll,
    remove,
    removeAll,
  };
}
