import { ChevronRight } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Avatar, Button, TicketPriorityBadge, TicketStatusBadge } from "../../components/ui";
import { categoryName, unitName, userById } from "../../lib/selectors";
import { relativeDate } from "../../lib/utils";
import type { AppData, Ticket } from "../../types";
import { SkeletonText } from "../../components/Skeleton";

export function TicketRowSkeleton({ queueMode = false }: { queueMode?: boolean }) {
  return queueMode ? (
    <div
      className="flex flex-col gap-3 p-4 sm:gap-4 sm:p-5 min-[1120px]:flex-row min-[1120px]:items-center"
      aria-hidden="true"
    >
      <div className="flex w-full min-w-0 flex-1 items-start gap-3 min-[1120px]:w-auto min-[1120px]:items-center">
        <SkeletonText className="mt-0.5 h-3 w-8 shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <SkeletonText className="h-4 w-2/3 max-w-64" />
          <SkeletonText className="h-3 w-full max-w-96" />
        </div>
      </div>
      <div className="flex w-full flex-wrap items-center gap-2 min-[1120px]:w-[290px] min-[1120px]:flex-nowrap min-[1120px]:justify-end">
        <SkeletonText className="h-6 w-20 rounded-full" />
        <SkeletonText className="h-6 w-24 rounded-full" />
      </div>
      <div className="flex w-full items-center justify-between gap-3 min-[1120px]:w-[190px] min-[1120px]:justify-end">
        <SkeletonText className="h-4 w-24" />
        <Button className="min-h-8 px-3 text-xs">Assumir</Button>
      </div>
    </div>
  ) : (
    <div className="flex items-center gap-3 px-5 py-4 sm:px-6" aria-hidden="true">
      <SkeletonText className="hidden h-3 w-8 shrink-0 sm:block" />
      <span className="min-w-0 flex-1 space-y-2">
        <SkeletonText className="h-4 w-2/3 max-w-64" />
        <SkeletonText className="h-3 w-3/4 max-w-80" />
      </span>
      <SkeletonText className="hidden h-6 w-20 rounded-full sm:block" />
      <SkeletonText className="h-6 w-24 rounded-full" />
      <SkeletonText className="hidden h-3 w-20 lg:block" />
      <ChevronRight size={16} className="shrink-0 text-line-strong" aria-hidden="true" />
    </div>
  );
}

export function TicketRow({
  ticket,
  data,
  queueMode = false,
  onClaim,
}: {
  ticket: Ticket;
  data: AppData;
  queueMode?: boolean;
  onClaim?: () => void;
}) {
  const assigned = userById(data, ticket.assignedTo);
  const navigate = useNavigate();
  if (queueMode) {
    const openTicket = () => navigate(`/chamados/${ticket.id}`);
    return (
      <div
        className="flex cursor-pointer flex-col gap-3 p-4 transition hover:bg-surface-soft focus-visible:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand sm:gap-4 sm:p-5 min-[1120px]:flex-row min-[1120px]:items-center"
        role="link"
        tabIndex={0}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("button")) return;
          openTicket();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            openTicket();
          }
        }}
      >
        <div className="flex w-full min-w-0 flex-1 items-start gap-3 min-[1120px]:w-auto min-[1120px]:items-center">
          <span className="shrink-0 font-mono text-xs font-bold text-subtle">#{ticket.number}</span>
          <div className="min-w-0">
            <span className="block break-words text-sm font-bold text-ink min-[1120px]:truncate">
              {ticket.title}
            </span>
            <p className="mt-1 break-words text-xs text-subtle min-[1120px]:truncate">
              {unitName(data, ticket.unitId)} · {categoryName(data, ticket.categoryId)} ·{" "}
              {ticket.requesterName}
            </p>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 min-[1120px]:w-[290px] min-[1120px]:flex-nowrap min-[1120px]:justify-end">
          <TicketPriorityBadge priority={ticket.priorityId} data={data} />
          <TicketStatusBadge status={ticket.status} />
        </div>
        <div className="flex w-full items-center justify-between gap-3 min-[1120px]:w-[190px] min-[1120px]:justify-end">
          {assigned ? (
            <span className="flex items-center gap-2 text-xs font-semibold text-secondary">
              <Avatar user={assigned} size="sm" />
              {assigned.fullName.split(" ")[0]}
            </span>
          ) : (
            <span className="text-xs font-semibold text-warning">Sem responsável</span>
          )}
          {!ticket.assignedTo && (
            <Button className="min-h-8 px-3 text-xs" onClick={onClaim}>
              Assumir
            </Button>
          )}
        </div>
      </div>
    );
  }
  return (
    <Link
      to={`/chamados/${ticket.id}`}
      className="flex items-center gap-3 px-5 py-4 transition hover:bg-surface-soft sm:px-6"
    >
      <span className="hidden w-12 text-xs font-bold text-subtle sm:block">#{ticket.number}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-ink">{ticket.title}</span>
        <span className="mt-1 block text-xs text-subtle">
          {unitName(data, ticket.unitId)} · {categoryName(data, ticket.categoryId)} ·{" "}
          {relativeDate(ticket.updatedAt)}
        </span>
      </span>
      <span className="hidden sm:block">
        <TicketPriorityBadge priority={ticket.priorityId} data={data} />
      </span>
      <TicketStatusBadge status={ticket.status} />
      <span className="hidden w-24 text-right text-xs text-subtle lg:block">
        {assigned?.fullName.split(" ")[0] ?? "Sem responsável"}
      </span>
      <ChevronRight size={16} className="text-line-strong" />
    </Link>
  );
}
