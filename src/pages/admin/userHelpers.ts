import { roleLabels, type Role } from "../../types";

export function roleLabel(role: Role) {
  return roleLabels[role];
}
