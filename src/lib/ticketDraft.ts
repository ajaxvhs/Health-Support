export interface TicketDraft {
  title: string;
  description: string;
  unitId: string;
  categoryId: string;
  priorityId: string;
  savedAt: number;
}
export type TicketDraftFields = Omit<TicketDraft, "savedAt">;

interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const TICKET_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const TICKET_DRAFT_PREFIX = "health-support:new-ticket-draft:";

function browserStorage(): DraftStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function ticketDraftKey(userId: string) {
  return `${TICKET_DRAFT_PREFIX}${userId}`;
}

function isTicketDraft(value: unknown): value is TicketDraft {
  if (typeof value !== "object" || value === null) return false;
  const draft = value as Partial<TicketDraft>;
  return (
    typeof draft.title === "string" &&
    typeof draft.description === "string" &&
    typeof draft.unitId === "string" &&
    typeof draft.categoryId === "string" &&
    typeof draft.priorityId === "string" &&
    typeof draft.savedAt === "number" &&
    Number.isFinite(draft.savedAt)
  );
}

export function readTicketDraft(
  userId: string,
  storage: DraftStorage | null = browserStorage(),
  now = Date.now(),
): TicketDraft | null {
  if (!storage) return null;
  const key = ticketDraftKey(userId);
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!isTicketDraft(value) || now - value.savedAt > TICKET_DRAFT_TTL_MS || value.savedAt > now) {
      storage.removeItem(key);
      return null;
    }
    return value;
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // Storage can be disabled or unavailable in the current browser context.
    }
    return null;
  }
}

export function saveTicketDraft(
  userId: string,
  fields: TicketDraftFields,
  storage: DraftStorage | null = browserStorage(),
  now = Date.now(),
) {
  if (!storage) return false;
  try {
    storage.setItem(ticketDraftKey(userId), JSON.stringify({ ...fields, savedAt: now }));
    return true;
  } catch {
    return false;
  }
}

export function clearTicketDraft(userId: string, storage: DraftStorage | null = browserStorage()) {
  try {
    storage?.removeItem(ticketDraftKey(userId));
  } catch {
    // Logout and successful submission must continue even if browser storage fails.
  }
}
