import { ChevronRight } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Avatar, Button, TicketPriorityBadge, TicketStatusBadge } from "../../components/ui";
import { categoryName, unitName, userById } from "../../lib/selectors";
import { relativeDate } from "../../lib/utils";
import type { AppData, Ticket } from "../../types";

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
        className="flex cursor-pointer flex-col gap-4 p-5 transition hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500 sm:flex-row sm:items-center"
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
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="font-mono text-xs font-bold text-slate-400">#{ticket.number}</span>
          <div className="min-w-0">
            <span className="block truncate text-sm font-bold text-ink">{ticket.title}</span>
            <p className="mt-1 truncate text-xs text-slate-400">
              {unitName(data, ticket.unitId)} · {categoryName(data, ticket.categoryId)} ·{" "}
              {ticket.requesterName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:w-[290px] sm:justify-end">
          <TicketPriorityBadge priority={ticket.priorityId} data={data} />
          <TicketStatusBadge status={ticket.status} />
        </div>
        <div className="flex items-center justify-between gap-3 sm:w-[190px] sm:justify-end">
          {assigned ? (
            <span className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <Avatar user={assigned} size="sm" />
              {assigned.fullName.split(" ")[0]}
            </span>
          ) : (
            <span className="text-xs font-semibold text-orange-600">Sem responsável</span>
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
      className="flex items-center gap-3 px-5 py-4 transition hover:bg-slate-50 sm:px-6"
    >
      <span className="hidden w-12 text-xs font-bold text-slate-400 sm:block">
        #{ticket.number}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-ink">{ticket.title}</span>
        <span className="mt-1 block text-xs text-slate-400">
          {unitName(data, ticket.unitId)} · {categoryName(data, ticket.categoryId)} ·{" "}
          {relativeDate(ticket.updatedAt)}
        </span>
      </span>
      <span className="hidden sm:block">
        <TicketPriorityBadge priority={ticket.priorityId} data={data} />
      </span>
      <TicketStatusBadge status={ticket.status} />
      <span className="hidden w-24 text-right text-xs text-slate-400 lg:block">
        {assigned?.fullName.split(" ")[0] ?? "Sem responsável"}
      </span>
      <ChevronRight size={16} className="text-slate-300" />
    </Link>
  );
}
