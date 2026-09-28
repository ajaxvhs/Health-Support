export const pwaFormSavedEvent = "health-support:pwa-form-saved";

const dirtyScopes = new WeakSet<object>();

function pwaUpdateScopes(root: ParentNode): Element[] {
  return Array.from(root.querySelectorAll("form, [data-pwa-update-protected]"));
}

export function markPwaScopeDirty(scope: object) {
  dirtyScopes.add(scope);
}

export function clearPwaScopeDirty(scope: object) {
  dirtyScopes.delete(scope);
}

export function isPwaScopeDirty(scope: object) {
  return dirtyScopes.has(scope);
}

export function markPwaFormInteraction(event: Event) {
  if (!(event.target instanceof Element)) return;
  const scope = event.target.closest("form, [data-pwa-update-protected]");
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

export function hasUnsavedPwaForms(root: ParentNode = document) {
  return pwaUpdateScopes(root).some(isPwaScopeDirty);
}

export function markPwaFormsSaved(root: ParentNode = document) {
  for (const scope of pwaUpdateScopes(root)) clearPwaScopeDirty(scope);
  window.dispatchEvent(new Event(pwaFormSavedEvent));
}
