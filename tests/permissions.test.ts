import { describe, expect, it } from "vitest";
import { can, isStaff } from "../src/lib/permissions";

describe("permissões por papel", () => {
  it("concede administração apenas ao administrador", () => {
    expect(can("admin", "manage_users")).toBe(true);
    expect(can("solicitante", "view_queue")).toBe(false);
  });

  it("identifica somente administradores como equipe", () => {
    expect(isStaff("admin")).toBe(true);
    expect(isStaff("solicitante")).toBe(false);
  });
});
