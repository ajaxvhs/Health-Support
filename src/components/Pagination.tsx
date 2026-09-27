import { ChevronLeft, ChevronRight } from "lucide-react";
import { getPaginationItems } from "../lib/pagination";
import { cn } from "../lib/utils";

export interface PaginationProps {
  currentPage: number;
  pageCount: number;
  start: number;
  end: number;
  total: number;
  itemLabel: string;
  ariaLabel: string;
  onPageChange: (page: number) => void;
}

export function Pagination({
  currentPage,
  pageCount,
  start,
  end,
  total,
  itemLabel,
  ariaLabel,
  onPageChange,
}: PaginationProps) {
  return (
    <nav
      aria-label={ariaLabel}
      className="grid gap-3 border-t border-line-soft px-4 py-3 text-xs text-muted sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:px-5"
    >
      <span className="sm:justify-self-start">
        Exibindo {start + 1}-{end} de {total} {itemLabel}
      </span>
      <div className="flex items-center justify-center gap-1 sm:justify-self-center">
        <button
          type="button"
          aria-label="Página anterior"
          disabled={currentPage === 1}
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-muted transition hover:bg-surface-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        {getPaginationItems(currentPage, pageCount).map((item, index) =>
          item === "ellipsis" ? (
            <span key={`ellipsis-${index}`} className="flex h-10 w-10 items-center justify-center">
              ...
            </span>
          ) : (
            <button
              key={item}
              type="button"
              aria-label={`Ir para a página ${item}`}
              aria-current={item === currentPage ? "page" : undefined}
              onClick={() => onPageChange(item)}
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-lg font-semibold transition",
                item === currentPage
                  ? "bg-brand-strong text-on-brand"
                  : "text-muted hover:bg-surface-soft hover:text-ink",
              )}
            >
              {item}
            </button>
          ),
        )}
        <button
          type="button"
          aria-label="Próxima página"
          disabled={currentPage === pageCount}
          onClick={() => onPageChange(Math.min(pageCount, currentPage + 1))}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-muted transition hover:bg-surface-soft hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>
      <span aria-hidden="true" className="hidden sm:block" />
    </nav>
  );
}
