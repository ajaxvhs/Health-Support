import type { AppData, Profile, TicketParticipant } from "../types";

export function userById(data: AppData, id?: string): Profile | TicketParticipant | undefined {
  return (
    data.profiles.find((profile) => profile.id === id) ??
    data.ticketParticipants?.find((participant) => participant.id === id)
  );
}

export function unitName(data: AppData, id: string) {
  return data.units.find((unit) => unit.id === id)?.name ?? "Unidade";
}

export function categoryName(data: AppData, id: string) {
  return data.categories.find((category) => category.id === id)?.name ?? "Categoria";
}
