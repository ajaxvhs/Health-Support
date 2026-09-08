import { roleLabels, type AppData, type Role } from "../../types";

export function roleLabel(role: Role) {
  return roleLabels[role];
}

export function isUserReferenced(data: AppData, id: string) {
  return (
    data.tickets.some((ticket) => ticket.createdBy === id || ticket.assignedTo === id) ||
    data.messages.some((message) => message.senderId === id) ||
    data.events.some((event) => event.actorId === id)
  );
}
