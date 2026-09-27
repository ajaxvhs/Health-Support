import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn, formatDateKey, localDateKey } from "../lib/utils";
import { useFloatingPosition } from "./useFloatingPosition";

const weekdays = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const monthFormatter = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" });
const monthNameFormatter = new Intl.DateTimeFormat("pt-BR", { month: "long" });
function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatInputDate(date: Date) {
  return localDateKey(date);
}

function monthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function calendarDays(month: Date) {
  const first = monthStart(month);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const weekCount = Math.ceil((first.getDay() + daysInMonth) / 7);
  return Array.from({ length: weekCount * 7 }, (_, index) => {
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
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  const [month, setMonth] = useState(() => monthStart(from ? parseDate(from) : new Date()));
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelPosition = useFloatingPosition(buttonRef, open, panelRef, "bottom");
  const startDate = from ? parseDate(from) : null;
  const endKey = to || (from ? localDateKey(new Date()) : "");
  const endDate = endKey ? parseDate(endKey) : null;
  const today = localDateKey(new Date());
  const days = calendarDays(month);

  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (
        !buttonRef.current?.contains(event.target as Node) &&
        !panelRef.current?.contains(event.target as Node)
      ) {
        setOpen(false);
        setPendingStart(null);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  const displayValue = pendingStart
    ? `Início ${formatDateKey(pendingStart)} — escolha o fim`
    : startDate && endDate
      ? `${formatDateKey(from)} – ${formatDateKey(endKey)}`
      : "Selecionar período";
  const chooseDay = (day: Date) => {
    const value = formatInputDate(day);
    if (value > today) return;
    if (!pendingStart) {
      setPendingStart(value);
      return;
    }

    if (value < pendingStart) onChange(value, pendingStart);
    else onChange(pendingStart, value);
    setPendingStart(null);
    setOpen(false);
  };
  const applyThroughToday = () => {
    if (!pendingStart) return;
    onChange(pendingStart, today);
    setPendingStart(null);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setPendingStart(null);
          setOpen((current) => !current);
        }}
        className={cn(
          "flex h-11 w-full items-center gap-2 rounded-xl border bg-surface px-3 text-left text-xs outline-none transition focus:border-brand-focus focus:ring-2 focus:ring-brand-soft",
          open ? "border-brand-focus ring-2 ring-brand-soft" : "border-line-strong",
          !from && "text-subtle",
        )}
      >
        <CalendarDays size={16} className="shrink-0 text-subtle" />
        <span className="min-w-0 flex-1 truncate">{displayValue}</span>
        {from && (
          <X
            size={15}
            className="shrink-0 text-subtle hover:text-secondary"
            onClick={(event) => {
              event.stopPropagation();
              setPendingStart(null);
              onChange("", "");
            }}
          />
        )}
        <ChevronDown
          size={15}
          className={cn("shrink-0 text-subtle transition-transform", open && "rotate-180")}
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
                  panelPosition.left +
                    (panelPosition.width -
                      Math.min(336, panelPosition.width, window.innerWidth - 32)) /
                      2,
                  window.scrollX + window.innerWidth - Math.min(336, window.innerWidth - 32) - 8,
                ),
              ),
              width: Math.min(336, panelPosition.width, window.innerWidth - 32),
            }}
            className="z-[1000] w-[min(21rem,calc(100vw-2rem))] rounded-2xl border border-line-soft bg-surface p-4 shadow-xl"
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
                className="rounded-lg p-2 text-secondary hover:bg-surface-muted"
              >
                <ChevronLeft size={17} />
              </button>
              <div className="flex flex-col items-center leading-tight">
                <span className="font-mono text-[10px] font-bold tracking-widest text-subtle">
                  {month.getFullYear()}
                </span>
                <span className="text-sm font-medium capitalize text-ink">
                  {monthNameFormatter.format(month)}
                </span>
              </div>
              <button
                type="button"
                aria-label="Próximo mês"
                onClick={() =>
                  setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))
                }
                className="rounded-lg p-2 text-secondary hover:bg-surface-muted"
              >
                <ChevronRight size={17} />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold uppercase text-subtle">
              {weekdays.map((day) => (
                <span key={day} className="py-1">
                  {day}
                </span>
              ))}
              {days.map((day) => {
                const value = formatInputDate(day);
                const isCurrentMonth = day.getMonth() === month.getMonth();
                const activeStart = pendingStart ?? from;
                const activeEnd = pendingStart ? "" : endKey;
                const isStart = value === activeStart;
                const isEnd = value === activeEnd;
                const isToday = value === today;
                const inRange = Boolean(
                  activeStart && activeEnd && value > activeStart && value < activeEnd,
                );
                return (
                  <button
                    key={value}
                    type="button"
                    aria-label={`${day.getDate()} de ${monthFormatter.format(day)}${isToday ? ", hoje" : ""}`}
                    onClick={() => chooseDay(day)}
                    disabled={value > today}
                    className={cn(
                      "relative h-9 rounded-lg text-xs transition",
                      !isCurrentMonth && "text-subtle",
                      isCurrentMonth && "text-secondary hover:bg-brand-soft",
                      value > today && "cursor-not-allowed opacity-35 hover:bg-transparent",
                      inRange && "rounded-none bg-brand-soft text-brand-contrast",
                      isToday &&
                        !isStart &&
                        !isEnd &&
                        "font-bold text-brand ring-1 ring-brand-focus",
                      isToday && (isStart || isEnd) && "ring-2 ring-brand-hover ring-offset-1",
                      isStart &&
                        "rounded-l-lg bg-brand-strong font-bold text-on-brand hover:bg-brand-strong",
                      isEnd &&
                        "rounded-r-lg bg-brand-strong font-bold text-on-brand hover:bg-brand-strong",
                      isStart && isEnd && "rounded-lg",
                    )}
                  >
                    {day.getDate()}
                    {isToday && (
                      <span
                        className={cn(
                          "absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full",
                          isStart || isEnd ? "bg-on-brand" : "bg-brand-strong",
                        )}
                      />
                    )}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-3">
              <p className="min-w-0 flex-1 text-center text-[11px] text-subtle">
                {pendingStart
                  ? `Início selecionado: ${formatDateKey(pendingStart)}. Escolha uma data final ou confirme até hoje.`
                  : from && endKey
                    ? `${formatDateKey(from)} – ${formatDateKey(endKey)}. Selecione uma data para iniciar outro período.`
                    : "Selecione a data inicial; depois escolha a data final ou confirme até hoje."}
              </p>
              {pendingStart && (
                <button
                  type="button"
                  onClick={applyThroughToday}
                  className="min-h-8 rounded-lg bg-brand-strong px-3 text-xs font-bold text-on-brand hover:bg-brand-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-focus"
                >
                  Até hoje
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
