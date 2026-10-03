export const pwaFormStateChangeEvent = "health-support:pwa-form-state-change";

const dirtyScopes = new WeakSet<object>();
const pendingMutations = new WeakMap<object, Set<symbol>>();
const pendingScopes = new Set<object>();

const pwaScopeSelector = "form, [data-pwa-update-protected]";

function pwaUpdateScopes(root: ParentNode): Element[] {
  const descendants = Array.from(root.querySelectorAll(pwaScopeSelector));
  if (typeof Element !== "undefined" && root instanceof Element && root.matches(pwaScopeSelector))
    return [root, ...descendants];
  return descendants;
}

function announcePwaFormStateChange() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(pwaFormStateChangeEvent));
}

export function markPwaScopeDirty(scope: object) {
  dirtyScopes.add(scope);
}

export function clearPwaScopeDirty(scope: object) {
  dirtyScopes.delete(scope);
}

export function markPwaScopeSaved(scope: object) {
  clearPwaScopeDirty(scope);
  announcePwaFormStateChange();
}

export function isPwaScopeDirty(scope: object) {
  return dirtyScopes.has(scope);
}

export function beginPwaScopeMutation(scope: object) {
  const token = Symbol("pwa-form-mutation");
  const mutations = pendingMutations.get(scope) ?? new Set<symbol>();
  mutations.add(token);
  pendingMutations.set(scope, mutations);
  pendingScopes.add(scope);
  announcePwaFormStateChange();
  return { scope, token };
}

export function finishPwaScopeMutation(
  mutation: ReturnType<typeof beginPwaScopeMutation>,
  succeeded: boolean,
) {
  const mutations = pendingMutations.get(mutation.scope);
  mutations?.delete(mutation.token);
  if (!mutations?.size) {
    pendingMutations.delete(mutation.scope);
    pendingScopes.delete(mutation.scope);
  }

  if (succeeded) clearPwaScopeDirty(mutation.scope);
  announcePwaFormStateChange();
  return succeeded;
}

export async function runPwaScopeMutation<T>(
  scope: object,
  mutate: () => Promise<T>,
  succeeded: (value: T) => boolean = () => true,
): Promise<T> {
  const mutation = beginPwaScopeMutation(scope);
  try {
    const value = await mutate();
    finishPwaScopeMutation(mutation, succeeded(value));
    return value;
  } catch (error) {
    finishPwaScopeMutation(mutation, false);
    throw error;
  }
}

export function hasUnsavedPwaForms(root: ParentNode = document) {
  return pwaUpdateScopes(root).some(isPwaScopeDirty);
}

export function hasPendingPwaMutations() {
  return pendingScopes.size > 0;
}

export function shouldApplyPwaUpdate(state: {
  updatePending: boolean;
  applying: boolean;
  online: boolean;
  hasUnsavedForms: boolean;
  hasPendingMutation: boolean;
}) {
  return (
    state.updatePending &&
    !state.applying &&
    state.online &&
    !state.hasUnsavedForms &&
    !state.hasPendingMutation
  );
}

export function markPwaFormInteraction(event: Event) {
  if (!(event.target instanceof Element)) return;
  const scope = event.target.closest("[data-pwa-update-protected]") ?? event.target.closest("form");
  if (!scope) return;

  if (event.type === "click") {
    if (!event.target.closest('button[aria-haspopup="listbox"]')) return;
    markPwaScopeDirty(scope);
    return;
  }

  if (event.type === "input" || event.type === "change") {
    const field = event.target.closest("input, textarea, select");
    if (
      !field ||
      ("disabled" in field && field.disabled) ||
      ("readOnly" in field && field.readOnly)
    )
      return;
    markPwaScopeDirty(scope);
    return;
  }

  if (event.type === "submit") markPwaScopeDirty(scope);
}
