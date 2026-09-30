export type AdminUserRole = "admin" | "solicitante";

export const ADMIN_USER_ACTIONS = [
  "list",
  "create",
  "update",
  "set_active",
  "delete",
  "reset_password",
  "bulk_toggle",
  "bulk_delete",
] as const;

export type AdminUserActionName = (typeof ADMIN_USER_ACTIONS)[number];

export function isAdminUserAction(value: unknown): value is AdminUserActionName {
  return typeof value === "string" && (ADMIN_USER_ACTIONS as readonly string[]).includes(value);
}

export type AdminUserActionRequest =
  | { action: "list" }
  | {
      action: "create";
      fullName: string;
      username: string;
      email: string;
      phone: string;
      temporaryPassword: string;
      unitId: string;
      role: AdminUserRole;
    }
  | {
      action: "update";
      id: string;
      fullName?: string;
      username?: string;
      email?: string;
      phone?: string;
      unitId?: string;
      role?: AdminUserRole;
    }
  | { action: "delete"; id: string }
  | { action: "set_active"; id: string; isActive: boolean }
  | { action: "reset_password"; id: string; password: string }
  | { action: "bulk_toggle"; ids: string[]; isActive: boolean }
  | { action: "bulk_delete"; ids: string[] };

export type AdminUserDeleteOutcome = { id: string; outcome: "deleted" | "deactivated" };
export type BulkUserDeleteResult = {
  outcomes: Array<AdminUserDeleteOutcome | { id: string; outcome: "failed" }>;
};

export interface AdminUserListItem {
  id: string;
  username: string;
  full_name: string;
  phone: string;
  role: AdminUserRole;
  default_unit_id: string;
  is_active: boolean;
  must_change_password: boolean;
  email: string;
}

export type AdminUserActionResponseMap = {
  list: { users: AdminUserListItem[] };
  create: { id: string };
  update: { outcome: "updated"; id: string };
  set_active: { outcome: "updated"; id: string };
  delete: AdminUserDeleteOutcome;
  reset_password: { ok: true };
  bulk_toggle: { updated: string[] };
  bulk_delete: BulkUserDeleteResult;
};

export interface AdminUserActionErrorResponse {
  error: string;
  code?: string;
  outcome?: "partial_failure";
  authUserId?: string;
}
