import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "../lib/utils";
import { useFloatingPosition } from "./useFloatingPosition";

const weekdays = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const monthFormatter = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
const dateFormatter = new Intl.DateTimeFormat("pt-BR");

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatInputDate(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function calendarDays(month: Date) {
  const first = monthStart(month);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

export function DateRangePicker({
  from,
  to,
  onChange,
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => monthStart(from ? parseDate(from) : new Date()));
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelPosition = useFloatingPosition(buttonRef, open);
  const startDate = from ? parseDate(from) : null;
  const endDate = to ? parseDate(to) : null;
  const today = formatInputDate(new Date());
  const days = calendarDays(month);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (
        !buttonRef.current?.contains(event.target as Node) &&
        !panelRef.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const displayValue = startDate
    ? `${dateFormatter.format(startDate)}${endDate ? ` - ${dateFormatter.format(endDate)}` : " - data final"}`
    : "Selecionar período";
  const chooseDay = (day: Date) => {
    const value = formatInputDate(day);
    if (!from || to) {
      onChange(value, "");
      return;
    }
    if (value < from) onChange(value, from);
    else onChange(from, value);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex h-12 w-full items-center gap-2 rounded-xl border bg-white px-3 text-left text-xs outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100",
          open ? "border-teal-600 ring-2 ring-teal-100" : "border-slate-200",
          !from && "text-slate-400",
        )}
      >
        <CalendarDays size={16} className="shrink-0 text-slate-400" />
        <span className="min-w-0 flex-1 truncate">{displayValue}</span>
        {from && (
          <X
            size={15}
            className="shrink-0 text-slate-400 hover:text-slate-700"
            onClick={(event) => {
              event.stopPropagation();
              onChange("", "");
            }}
          />
        )}
        <ChevronDown
          size={15}
          className={cn("shrink-0 text-slate-400 transition-transform", open && "rotate-180")}
        />
      </button>
      {open &&
        panelPosition &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: "absolute",
              top: panelPosition.top,
              left: Math.max(
                window.scrollX + 8,
                Math.min(
                  panelPosition.left,
                  window.scrollX + window.innerWidth - Math.min(336, window.innerWidth - 32) - 8,
                ),
              ),
            }}
            className="z-[1000] w-[min(21rem,calc(100vw-2rem))] rounded-2xl border border-slate-100 bg-white p-4 shadow-xl"
            role="dialog"
            aria-label="Selecionar período"
          >
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                aria-label="Mês anterior"
                onClick={() =>
                  setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))
                }
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <ChevronLeft size={17} />
              </button>
              <p className="text-sm font-bold capitalize text-ink">
                {monthFormatter.format(month)}
              </p>
              <button
                type="button"
                aria-label="Próximo mês"
                onClick={() =>
                  setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))
                }
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <ChevronRight size={17} />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase text-slate-400">
              {weekdays.map((day) => (
                <span key={day} className="py-1">
                  {day}
                </span>
              ))}
              {days.map((day) => {
                const value = formatInputDate(day);
                const isCurrentMonth = day.getMonth() === month.getMonth();
                const isStart = value === from;
                const isEnd = value === to;
                const isToday = value === today;
                const inRange = Boolean(from && to && value > from && value < to);
                return (
                  <button
                    key={value}
                    type="button"
                    aria-label={`${day.getDate()} de ${monthFormatter.format(day)}${isToday ? ", hoje" : ""}`}
                    onClick={() => chooseDay(day)}
                    className={cn(
                      "relative h-9 rounded-lg text-xs transition",
                      !isCurrentMonth && "text-slate-300",
                      isCurrentMonth && "text-slate-700 hover:bg-teal-50",
                      inRange && "rounded-none bg-teal-50 text-teal-800",
                      isToday &&
                        !isStart &&
                        !isEnd &&
                        "font-bold text-teal-700 ring-1 ring-teal-600",
                      isToday && (isStart || isEnd) && "ring-2 ring-teal-300 ring-offset-1",
                      isStart && "rounded-l-lg bg-teal-700 font-bold text-white hover:bg-teal-700",
                      isEnd && "rounded-r-lg bg-teal-700 font-bold text-white hover:bg-teal-700",
                      isStart && isEnd && "rounded-lg",
                    )}
                  >
                    {day.getDate()}
                    {isToday && (
                      <span
                        className={cn(
                          "absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full",
                          isStart || isEnd ? "bg-white" : "bg-teal-700",
                        )}
                      />
                    )}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
              {from && !to ? "Selecione a data final" : "Selecione a data inicial e a data final"}
            </p>
          </div>,
          document.body,
        )}
    </div>
  );
}
