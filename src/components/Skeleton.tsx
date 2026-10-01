import { cn } from "../lib/utils";
import { Pencil, Power, Trash2 } from "lucide-react";

function SkeletonBlock({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("skeleton-block block rounded-lg", className)} />;
}

export function SkeletonText({ className }: { className?: string }) {
  return <SkeletonBlock className={cn("h-4 w-full", className)} />;
}

export function SkeletonTableRows({
  count = 6,
  className,
  variant = "audit",
}: {
  count?: number;
  className?: string;
  variant?: "audit" | "users";
}) {
  return (
    <div
      className={cn(variant === "audit" && "divide-y divide-line-soft", className)}
      aria-hidden="true"
    >
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className={cn(
            variant === "users"
              ? "mx-3 my-3 rounded-2xl border border-line-soft p-4 lg:mx-0 lg:my-0 lg:grid lg:min-h-[5.5rem] lg:grid-cols-[28px_minmax(0,1.65fr)_minmax(0,1fr)_148px_80px_132px] lg:items-center lg:gap-2 lg:rounded-none lg:border-x-0 lg:border-b lg:border-t-0 lg:px-3 lg:py-3 xl:grid-cols-[36px_minmax(280px,2fr)_minmax(150px,1.1fr)_148px_90px_132px] xl:gap-4 xl:px-5 xl:py-4"
              : "flex min-h-40 items-center gap-3 px-5 py-3 sm:h-[5.5rem] sm:min-h-[5.5rem] sm:px-7",
          )}
        >
          {variant === "users" ? (
            <>
              <div className="space-y-4 lg:hidden">
                <div className="flex items-start gap-3">
                  <SkeletonBlock className="h-10 w-10 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <SkeletonBlock className="h-4 w-2/3" />
                    <SkeletonBlock className="h-3 w-1/3" />
                    <div className="mt-2 flex h-6 items-center">
                      <SkeletonBlock className="h-5 w-14 rounded-full" />
                    </div>
                  </div>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center">
                    <span className="h-4 w-4 rounded border border-line-strong" />
                  </span>
                </div>
                <div className="space-y-3 rounded-xl bg-surface-soft/70 p-3">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-subtle">
                      E-mail
                    </span>
                    <SkeletonBlock className="mt-1 h-3 w-3/4" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-subtle">
                      Unidade
                    </span>
                    <SkeletonBlock className="mt-1 h-4 w-1/2" />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-subtle">
                      Perfil
                    </span>
                    <div className="mt-1 flex min-h-10 items-center rounded-xl border border-line bg-surface px-3">
                      <SkeletonBlock className="h-4 w-20" />
                    </div>
                  </div>
                </div>
                <div className="flex justify-center gap-2 border-t border-line-soft pt-3">
                  <UserActionSlots />
                </div>
              </div>
              <div className="hidden lg:contents">
                <span className="block h-4 w-4 shrink-0 rounded border border-line-strong" />
                <div className="flex min-w-0 items-center gap-3">
                  <SkeletonBlock className="h-8 w-8 shrink-0 rounded-lg" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <SkeletonBlock className="h-4 w-3/4" />
                    <SkeletonBlock className="h-3 w-1/2" />
                    <SkeletonBlock className="h-3 w-2/3" />
                  </div>
                </div>
              </div>
              <div className="hidden min-w-0 lg:block">
                <SkeletonBlock className="mx-auto h-4 w-3/4" />
              </div>
              <div className="hidden min-w-0 lg:block">
                <div className="flex min-h-10 items-center rounded-xl border border-line bg-surface px-3">
                  <SkeletonBlock className="h-4 w-3/4" />
                </div>
              </div>
              <div className="hidden justify-center lg:flex">
                <span className="flex h-6 items-center gap-1.5 rounded-full border border-line-soft px-2.5">
                  <span className="h-1 w-1 rounded-full bg-line-strong" />
                  <SkeletonBlock className="h-3 w-9" />
                </span>
              </div>
              <div className="hidden items-center justify-center gap-1 lg:flex">
                <UserActionSlots />
              </div>
            </>
          ) : (
            <>
              <SkeletonBlock
                className={cn(
                  "h-9 w-9 shrink-0",
                  variant === "audit" ? "rounded-lg" : "rounded-full",
                )}
              />
              {variant === "audit" ? (
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <SkeletonBlock className="h-4 w-28" />
                    <SkeletonBlock className="h-4 w-48 max-w-[45vw]" />
                    <SkeletonBlock className="h-6 w-16 rounded-full" />
                    <SkeletonBlock className="h-6 w-20 rounded-full" />
                    <SkeletonBlock className="h-4 w-8" />
                  </div>
                  <SkeletonBlock className="mt-1 h-3 w-28" />
                </div>
              ) : (
                <div className="min-w-0 flex-1 space-y-3">
                  <SkeletonBlock className="h-4 w-3/4 max-w-xl" />
                  <SkeletonBlock className="h-3 w-28" />
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function UserActionSlots() {
  return (
    <>
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-soft text-muted"
        aria-hidden="true"
      >
        <Pencil size={15} />
      </span>
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-soft text-muted"
        aria-hidden="true"
      >
        <Power size={14} />
      </span>
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-danger-soft text-danger"
        aria-hidden="true"
      >
        <Trash2 size={15} />
      </span>
    </>
  );
}

export function SyncIndicator({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span className="inline-flex items-center gap-2 text-xs text-subtle" role="status">
      <span className="h-2 w-2 rounded-full bg-brand" aria-hidden="true" />
      Atualizando dados…
    </span>
  );
}
