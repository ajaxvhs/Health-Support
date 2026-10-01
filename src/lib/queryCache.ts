export const queryCache = {
  ticketRefreshInterval: 60 * 1000,
  appData: { staleTime: 10 * 60 * 1000, gcTime: 30 * 60 * 1000 },
  ticketNavigation: { staleTime: 30 * 1000, gcTime: 10 * 60 * 1000 },
  ticketPages: { staleTime: 2 * 60 * 1000, gcTime: 10 * 60 * 1000 },
  ticketDashboard: { staleTime: 2 * 60 * 1000, gcTime: 10 * 60 * 1000 },
  ticketDetail: { staleTime: 60 * 1000, gcTime: 10 * 60 * 1000 },
  auditPages: { staleTime: 60 * 1000, gcTime: 10 * 60 * 1000 },
  adminUsers: { staleTime: 2 * 60 * 1000, gcTime: 10 * 60 * 1000 },
  notifications: { staleTime: 60 * 1000, gcTime: 10 * 60 * 1000 },
  notificationUnreadCount: { staleTime: 30 * 1000, gcTime: 10 * 60 * 1000 },
} as const;
