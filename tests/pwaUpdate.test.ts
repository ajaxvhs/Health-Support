import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearPwaScopeDirty,
  hasPendingPwaMutations,
  hasUnsavedPwaForms,
  markPwaFormInteraction,
  markPwaScopeDirty,
  markPwaScopeSaved,
  runPwaScopeMutation,
  shouldApplyPwaUpdate,
} from "../src/lib/pwaUpdate";
import { pwaUpdateRetryDelay } from "../src/lib/pwaUpdateRetry";

function rootContaining(...scopes: object[]) {
  return { querySelectorAll: () => scopes } as unknown as ParentNode;
}

describe("proteção de formulários durante atualização PWA", () => {
  afterEach(() => vi.unstubAllGlobals());

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

  it("ignora campos bloqueados e acompanha campos editáveis", () => {
    class FakeElement {
      constructor(
        private readonly scope: object,
        readonly disabled: boolean,
      ) {}
      closest(selector: string) {
        if (selector === "form") return this.scope;
        if (selector === "input, textarea, select") return this;
        return null;
      }
    }
    vi.stubGlobal("Element", FakeElement);
    const disabledScope = {};
    const editableScope = {};

    markPwaFormInteraction({
      type: "input",
      target: new FakeElement(disabledScope, true) as unknown as Element,
    } as unknown as Event);
    markPwaFormInteraction({
      type: "input",
      target: new FakeElement(editableScope, false) as unknown as Element,
    } as unknown as Event);

    expect(hasUnsavedPwaForms(rootContaining(disabledScope))).toBe(false);
    expect(hasUnsavedPwaForms(rootContaining(editableScope))).toBe(true);
  });

  it("salvar a conversa mantém outro formulário alterado e o manager aguarda", async () => {
    const messageForm = {};
    const resolutionForm = {};
    const root = rootContaining(messageForm, resolutionForm);
    let finishSave!: (messageId: string) => void;
    markPwaScopeDirty(messageForm);
    markPwaScopeDirty(resolutionForm);

    const sending = runPwaScopeMutation(
      messageForm,
      () => new Promise<string>((resolve) => (finishSave = resolve)),
    );
    expect(hasPendingPwaMutations()).toBe(true);
    expect(
      shouldApplyPwaUpdate({
        updatePending: true,
        applying: false,
        online: true,
        hasUnsavedForms: hasUnsavedPwaForms(root),
        hasPendingMutation: hasPendingPwaMutations(),
      }),
    ).toBe(false);

    finishSave("message-1");
    await expect(sending).resolves.toBe("message-1");
    expect(hasPendingPwaMutations()).toBe(false);
    expect(hasUnsavedPwaForms(root)).toBe(true);
    expect(hasUnsavedPwaForms(rootContaining(messageForm))).toBe(false);
    expect(
      shouldApplyPwaUpdate({
        updatePending: true,
        applying: false,
        online: true,
        hasUnsavedForms: hasUnsavedPwaForms(root),
        hasPendingMutation: hasPendingPwaMutations(),
      }),
    ).toBe(false);

    markPwaScopeSaved(resolutionForm);
    expect(
      shouldApplyPwaUpdate({
        updatePending: true,
        applying: false,
        online: true,
        hasUnsavedForms: hasUnsavedPwaForms(root),
        hasPendingMutation: hasPendingPwaMutations(),
      }),
    ).toBe(true);
  });

  it("libera a atualização após a operação bem-sucedida e o formulário salvo", async () => {
    const form = {};
    const root = rootContaining(form);
    let finishSave!: () => void;
    markPwaScopeDirty(form);

    const saving = runPwaScopeMutation(
      form,
      () => new Promise<void>((resolve) => (finishSave = resolve)),
    );
    expect(
      shouldApplyPwaUpdate({
        updatePending: true,
        applying: false,
        online: true,
        hasUnsavedForms: hasUnsavedPwaForms(root),
        hasPendingMutation: hasPendingPwaMutations(),
      }),
    ).toBe(false);
    finishSave();

    await expect(saving).resolves.toBeUndefined();
    expect(hasUnsavedPwaForms(root)).toBe(false);
    expect(hasPendingPwaMutations()).toBe(false);
    expect(
      shouldApplyPwaUpdate({
        updatePending: true,
        applying: false,
        online: true,
        hasUnsavedForms: hasUnsavedPwaForms(root),
        hasPendingMutation: hasPendingPwaMutations(),
      }),
    ).toBe(true);
  });

  it("mantém dirty após falha e reconhece o próprio elemento raiz", async () => {
    vi.stubGlobal(
      "Element",
      class FakeElement {
        matches() {
          return true;
        }
        querySelectorAll() {
          return [];
        }
      },
    );
    const form = new Element() as unknown as object & ParentNode;
    markPwaScopeDirty(form);

    await expect(
      runPwaScopeMutation(form, async () => Promise.reject(new Error("network"))),
    ).rejects.toThrow("network");

    expect(hasUnsavedPwaForms(form)).toBe(true);
    expect(hasPendingPwaMutations()).toBe(false);
  });

  it("limpa o elemento raiz salvo sem limpar um escopo irmão", () => {
    class FakeElement {
      constructor(private readonly scopes: FakeElement[] = []) {}
      matches() {
        return true;
      }
      querySelectorAll() {
        return this.scopes;
      }
    }
    vi.stubGlobal("Element", FakeElement);
    const savedScope = new FakeElement();
    const unrelatedScope = new FakeElement();
    const page = new FakeElement([savedScope, unrelatedScope]);
    markPwaScopeDirty(savedScope);
    markPwaScopeDirty(unrelatedScope);

    markPwaScopeSaved(savedScope);

    expect(hasUnsavedPwaForms(savedScope as unknown as ParentNode)).toBe(false);
    expect(hasUnsavedPwaForms(page as unknown as ParentNode)).toBe(true);
    expect(hasUnsavedPwaForms(unrelatedScope as unknown as ParentNode)).toBe(true);
  });

  it("não libera atualização enquanto há mutação pendente, mesmo após reset", async () => {
    const form = {};
    const root = rootContaining(form);
    let finishSave!: () => void;
    markPwaScopeDirty(form);
    const saving = runPwaScopeMutation(
      form,
      () => new Promise<void>((resolve) => (finishSave = resolve)),
    );

    clearPwaScopeDirty(form);
    expect(
      shouldApplyPwaUpdate({
        updatePending: true,
        applying: false,
        online: true,
        hasUnsavedForms: hasUnsavedPwaForms(root),
        hasPendingMutation: hasPendingPwaMutations(),
      }),
    ).toBe(false);

    finishSave();
    await saving;
    expect(hasPendingPwaMutations()).toBe(false);
  });
});

describe("retry de falhas ao verificar atualizações do PWA", () => {
  it("usa backoff limitado sem retry agressivo", () => {
    expect(pwaUpdateRetryDelay(0)).toBe(30_000);
    expect(pwaUpdateRetryDelay(1)).toBe(120_000);
    expect(pwaUpdateRetryDelay(2)).toBe(600_000);
    expect(pwaUpdateRetryDelay(10)).toBe(600_000);
  });
});
