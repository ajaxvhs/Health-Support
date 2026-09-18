import { useRegisterSW } from "virtual:pwa-register/react";
import { useEffect } from "react";
import { Button } from "./ui";

export function AppUpdateNotice() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  useEffect(() => {
    const check = () => {
      if (navigator.onLine && "serviceWorker" in navigator) {
        void navigator.serviceWorker
          .getRegistration()
          .then((registration) => registration?.update())
          .catch(() => {});
      }
    };
    window.addEventListener("focus", check);
    const interval = window.setInterval(check, 60 * 60 * 1000);
    return () => {
      window.removeEventListener("focus", check);
      window.clearInterval(interval);
    };
  }, []);

  if (!needRefresh) return null;

  return (
    <aside
      className="fixed bottom-4 left-4 right-4 z-[150] rounded-2xl border border-teal-100 bg-white p-4 shadow-xl sm:left-auto sm:max-w-sm"
      role="status"
    >
      <p className="font-bold text-ink">Nova versão disponível</p>
      <p className="mt-1 text-sm text-slate-500">
        Conclua ou salve o que estiver preenchendo antes de atualizar.
      </p>
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="secondary" onClick={() => setNeedRefresh(false)}>
          Depois
        </Button>
        <Button onClick={() => updateServiceWorker(true)}>Atualizar</Button>
      </div>
    </aside>
  );
}
