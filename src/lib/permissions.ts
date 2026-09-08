import type { Role } from "../types";

export type Capability =
  | "view_queue"
  | "view_all_tickets"
  | "claim_tickets"
  | "manage_users"
  | "manage_catalogs"
  | "view_audit";

const capabilitiesByRole: Record<Role, readonly Capability[]> = {
  admin: [
    "view_queue",
    "view_all_tickets",
    "claim_tickets",
    "manage_users",
    "manage_catalogs",
    "view_audit",
  ],
  atendente: ["view_queue", "view_all_tickets", "claim_tickets"],
  solicitante: [],
};

export function can(role: Role, capability: Capability) {
  return capabilitiesByRole[role].includes(capability);
}

export function isStaff(role: Role) {
  return can(role, "view_queue");
}
