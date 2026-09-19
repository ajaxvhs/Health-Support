export function LoadingScreen({ label = "Carregando sessão..." }: { label?: string }) {
  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center bg-canvas text-muted"
      aria-label="Carregamento"
      aria-live="polite"
    >
      <span
        className="h-9 w-9 animate-spin rounded-full border-2 border-line border-t-brand-contrast"
        aria-hidden="true"
      />
      <p className="mt-3 text-sm font-medium">{label}</p>
    </main>
  );
}
