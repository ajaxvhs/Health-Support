import { describe, expect, it } from "vitest";
import {
  ADMIN_USER_LIMITS,
  isValidBulkSize,
  isWithinLimit,
} from "../supabase/functions/_shared/adminUserLimits";
import {
  ADMIN_USER_ACTIONS,
  isAdminUserAction,
} from "../supabase/functions/_shared/adminUserContract";

describe("limites do contrato administrativo de usuários", () => {
  it("aceita campos no limite e rejeita campos vazios ou acima do máximo", () => {
    expect(isWithinLimit("a".repeat(ADMIN_USER_LIMITS.username), ADMIN_USER_LIMITS.username)).toBe(
      true,
    );
    expect(
      isWithinLimit("a".repeat(ADMIN_USER_LIMITS.username + 1), ADMIN_USER_LIMITS.username),
    ).toBe(false);
    expect(isWithinLimit("   ", ADMIN_USER_LIMITS.fullName)).toBe(false);
    expect(isWithinLimit(null, ADMIN_USER_LIMITS.email)).toBe(false);
  });

  it("limita operações em lote a 100 IDs", () => {
    expect(isValidBulkSize(1)).toBe(true);
    expect(isValidBulkSize(ADMIN_USER_LIMITS.bulkIds)).toBe(true);
    expect(isValidBulkSize(ADMIN_USER_LIMITS.bulkIds + 1)).toBe(false);
    expect(isValidBulkSize(0)).toBe(false);
  });

  it("compartilha a lista de ações administrativas e rejeita ações desconhecidas", () => {
    expect(ADMIN_USER_ACTIONS).toEqual([
      "list",
      "create",
      "update",
      "set_active",
      "delete",
      "reset_password",
      "bulk_toggle",
      "bulk_delete",
    ]);
    expect(isAdminUserAction("set_active")).toBe(true);
    expect(isAdminUserAction("unknown_action")).toBe(false);
    expect(isAdminUserAction(null)).toBe(false);
  });
});
