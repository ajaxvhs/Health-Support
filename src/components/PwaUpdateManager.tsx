import { useCallback, useEffect, useRef } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import {
  clearPwaScopeDirty,
  hasUnsavedPwaForms,
  markPwaFormInteraction,
  pwaFormSavedEvent,
} from "../lib/pwaUpdate";

const UPDATE_CHECK_INTERVAL = 15 * 60 * 1000;
const UPDATE_CHECK_THROTTLE = 60 * 1000;

export function PwaUpdateManager() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  const updatePending = useRef(false);
  const applyingUpdate = useRef(false);
  const newControllerActive = useRef(false);
  const lastCheckAt = useRef(0);

  const applyWhenSafe = useCallback(() => {
    if (
      !updatePending.current ||
      applyingUpdate.current ||
      !navigator.onLine ||
      hasUnsavedPwaForms()
    )
      return;

    applyingUpdate.current = true;
    if (newControllerActive.current) {
      window.location.reload();
      return;
    }
    void Promise.resolve(updateServiceWorker(true)).catch(() => {
      applyingUpdate.current = false;
    });
  }, [updateServiceWorker]);

  useEffect(() => {
    if (!needRefresh) return;
    updatePending.current = true;
    applyWhenSafe();
  }, [applyWhenSafe, needRefresh]);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !document.body) return;
    let lastController = navigator.serviceWorker.controller;
    let checkTimer: number | undefined;

    const scheduleSafeApply = () => {
      window.clearTimeout(checkTimer);
      checkTimer = window.setTimeout(applyWhenSafe, 0);
    };
    const checkForWorkerUpdate = () => {
      if (!navigator.onLine || Date.now() - lastCheckAt.current < UPDATE_CHECK_THROTTLE) return;
      lastCheckAt.current = Date.now();
      void navigator.serviceWorker
        .getRegistration()
        .then((registration) => registration?.update())
        .catch(() => undefined);
    };
    const onControllerChange = () => {
      const nextController = navigator.serviceWorker.controller;
      const changedFromExistingController = Boolean(
        lastController && nextController && lastController !== nextController,
      );
      lastController = nextController;
      if (changedFromExistingController) {
        updatePending.current = true;
        newControllerActive.current = true;
      }
      scheduleSafeApply();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkForWorkerUpdate();
        scheduleSafeApply();
      }
    };
    const onFormReset = (event: Event) => {
      if (event.target instanceof Element) {
        const form = event.target.closest("form");
        if (form) clearPwaScopeDirty(form);
      }
      scheduleSafeApply();
    };
    const observer = new MutationObserver(scheduleSafeApply);
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener("input", markPwaFormInteraction, true);
    document.addEventListener("change", markPwaFormInteraction, true);
    document.addEventListener("click", markPwaFormInteraction, true);
    document.addEventListener("submit", markPwaFormInteraction, true);
    document.addEventListener("reset", onFormReset, true);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", checkForWorkerUpdate);
    window.addEventListener("focus", scheduleSafeApply);
    window.addEventListener("online", checkForWorkerUpdate);
    window.addEventListener("online", scheduleSafeApply);
    window.addEventListener(pwaFormSavedEvent, scheduleSafeApply);
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    checkForWorkerUpdate();
    const interval = window.setInterval(checkForWorkerUpdate, UPDATE_CHECK_INTERVAL);
    scheduleSafeApply();

    return () => {
      window.clearTimeout(checkTimer);
      window.clearInterval(interval);
      observer.disconnect();
      document.removeEventListener("input", markPwaFormInteraction, true);
      document.removeEventListener("change", markPwaFormInteraction, true);
      document.removeEventListener("click", markPwaFormInteraction, true);
      document.removeEventListener("submit", markPwaFormInteraction, true);
      document.removeEventListener("reset", onFormReset, true);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", checkForWorkerUpdate);
      window.removeEventListener("focus", scheduleSafeApply);
      window.removeEventListener("online", checkForWorkerUpdate);
      window.removeEventListener("online", scheduleSafeApply);
      window.removeEventListener(pwaFormSavedEvent, scheduleSafeApply);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, [applyWhenSafe]);

  return null;
}
