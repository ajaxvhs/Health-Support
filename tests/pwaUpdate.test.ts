import { describe, expect, it } from "vitest";
import { clearPwaScopeDirty, hasUnsavedPwaForms, markPwaScopeDirty } from "../src/lib/pwaUpdate";

function rootContaining(...scopes: object[]) {
  return { querySelectorAll: () => scopes } as unknown as ParentNode;
}

describe("proteção de formulários durante atualização PWA", () => {
  it("adia a atualização enquanto o formulário está marcado como alterado", () => {
    const form = {};
    const root = rootContaining(form);

    expect(hasUnsavedPwaForms(root)).toBe(false);
    markPwaScopeDirty(form);
    expect(hasUnsavedPwaForms(root)).toBe(true);
  });

  it("permite a atualização depois que a gravação limpa o estado alterado", () => {
    const form = {};
    const root = rootContaining(form);
    markPwaScopeDirty(form);

    clearPwaScopeDirty(form);

    expect(hasUnsavedPwaForms(root)).toBe(false);
  });

  it("não deixa o estado de um formulário bloquear outro escopo protegido", () => {
    const activeForm = {};
    const profileEditor = {};
    markPwaScopeDirty(profileEditor);

    expect(hasUnsavedPwaForms(rootContaining(activeForm))).toBe(false);
    expect(hasUnsavedPwaForms(rootContaining(profileEditor))).toBe(true);
  });
});
