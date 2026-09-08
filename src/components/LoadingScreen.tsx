export function LoadingScreen({ label = "Carregando sessão..." }: { label?: string }) {
  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center bg-cream text-slate-400"
      aria-label="Carregamento"
      aria-live="polite"
    >
      <span
        className="h-9 w-9 animate-spin rounded-full border-2 border-slate-200 border-t-teal-700 motion-reduce:animate-none"
        aria-hidden="true"
      />
      <p className="mt-3 text-sm font-medium">{label}</p>
    </main>
  );
}
