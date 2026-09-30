export const ADMIN_USER_LIMITS = {
  fullName: 120,
  username: 64,
  email: 254,
  phone: 32,
  password: 128,
  bulkIds: 100,
} as const;

export function isWithinLimit(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength;
}

export function isValidBulkSize(length: number) {
  return Number.isInteger(length) && length > 0 && length <= ADMIN_USER_LIMITS.bulkIds;
}
