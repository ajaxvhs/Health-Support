import { useCallback, useEffect, useRef } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { useToast } from "../context/useToast";
import {
  clearPwaScopeDirty,
  hasUnsavedPwaForms,
  markPwaFormInteraction,
  pwaFormSavedEvent,
} from "../lib/pwaUpdate";
import { pwaUpdateRetryDelay } from "../lib/pwaUpdateRetry";

const UPDATE_CHECK_INTERVAL = 15 * 60 * 1000;
const UPDATE_CHECK_THROTTLE = 60 * 1000;

export function PwaUpdateManager() {
  const { showToast } = useToast();
  const failureNoticeShown = useRef(false);
  const reportFailure = useRef<() => void>(() => {
    if (failureNoticeShown.current) return;
    failureNoticeShown.current = true;
    showToast(
      "Não foi possível atualizar agora. O app continuará funcionando e tentará novamente.",
      "info",
    );
  });
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({ onRegisterError: () => reportFailure.current() });
  const updatePending = useRef(false);
  const applyingUpdate = useRef(false);
  const newControllerActive = useRef(false);
  const lastCheckAt = useRef(0);
  const retryAttempt = useRef(0);
  const retryTimer = useRef<number | undefined>(undefined);
  const checkForWorkerUpdateRef = useRef<() => void>(() => undefined);

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
      reportFailure.current();
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
    const watchedRegistrations = new WeakSet<ServiceWorkerRegistration>();

    const scheduleRetry = () => {
      if (!failureNoticeShown.current) {
        showToast(
          "Não foi possível atualizar agora. O app continuará funcionando e tentará novamente.",
          "info",
        );
        failureNoticeShown.current = true;
      }
      window.clearTimeout(retryTimer.current);
      retryTimer.current = window.setTimeout(() => {
        retryTimer.current = undefined;
        lastCheckAt.current = 0;
        checkForWorkerUpdateRef.current();
      }, pwaUpdateRetryDelay(retryAttempt.current++));
    };
    reportFailure.current = scheduleRetry;

    const watchInstallFailure = (registration: ServiceWorkerRegistration) => {
      if (watchedRegistrations.has(registration)) return;
      watchedRegistrations.add(registration);
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (worker.state === "redundant") scheduleRetry();
        });
      });
    };

    const resetRetryState = () => {
      retryAttempt.current = 0;
      failureNoticeShown.current = false;
      window.clearTimeout(retryTimer.current);
      retryTimer.current = undefined;
    };

    const scheduleSafeApply = () => {
      window.clearTimeout(checkTimer);
      checkTimer = window.setTimeout(applyWhenSafe, 0);
    };
    const checkForWorkerUpdate = () => {
      if (!navigator.onLine || Date.now() - lastCheckAt.current < UPDATE_CHECK_THROTTLE) return;
      lastCheckAt.current = Date.now();
      void navigator.serviceWorker
        .getRegistration()
        .then((registration) => {
          if (!registration) return;
          watchInstallFailure(registration);
          return registration.update();
        })
        .then(() => {
          resetRetryState();
          scheduleSafeApply();
        })
        .catch(scheduleRetry);
    };
    checkForWorkerUpdateRef.current = checkForWorkerUpdate;
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
    const onOnline = () => {
      checkForWorkerUpdate();
      scheduleSafeApply();
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
    window.addEventListener("online", onOnline);
    window.addEventListener(pwaFormSavedEvent, scheduleSafeApply);
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    checkForWorkerUpdate();
    const interval = window.setInterval(checkForWorkerUpdate, UPDATE_CHECK_INTERVAL);
    scheduleSafeApply();

    return () => {
      window.clearTimeout(checkTimer);
      window.clearTimeout(retryTimer.current);
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
      window.removeEventListener("online", onOnline);
      window.removeEventListener(pwaFormSavedEvent, scheduleSafeApply);
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      reportFailure.current = () => undefined;
    };
  }, [applyWhenSafe, showToast]);

  return null;
}
