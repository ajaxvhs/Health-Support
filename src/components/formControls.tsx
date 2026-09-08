import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search, X } from "lucide-react";
import { cn } from "../lib/utils";

const inputClass =
  "min-h-12 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-ink outline-none transition hover:border-teal-300 focus:border-teal-600 focus:ring-2 focus:ring-teal-100";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export function SelectField({
  label,
  value,
  onChange,
  children,
  required = false,
  ariaLabel,
  compact = false,
  className,
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  required?: boolean;
  ariaLabel?: string;
  compact?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const labelId = useId();

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (
        !buttonRef.current?.contains(event.target as Node) &&
        !menuRef.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const options: SelectOption[] = [];
  const collectOptions = (items: ReactNode) =>
    Children.forEach(items, (child) => {
      if (!isValidElement(child)) return;
      if (child.props.value === undefined) return collectOptions(child.props.children);
      options.push({
        value: String(child.props.value),
        label: String(child.props.children ?? ""),
        disabled: Boolean(child.props.disabled),
      });
    });
  collectOptions(children);
  const selected = options.find((option) => option.value === value);

  return (
    <div className={cn("relative block", className)}>
      {label && (
        <span
          id={labelId}
          className={cn("mb-2 block text-sm font-bold text-ink", compact && "sr-only")}
        >
          {label}
          {required && <span className="ml-1 text-teal-700">*</span>}
        </span>
      )}
      <button
        ref={buttonRef}
        type="button"
        className={cn(
          inputClass,
          "flex cursor-pointer items-center justify-between text-left",
          compact && "min-h-9 rounded-lg px-2.5 text-xs",
        )}
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label ? undefined : ariaLabel}
        aria-labelledby={label ? labelId : undefined}
      >
        <span>{selected?.label || "Selecione uma opção"}</span>
        <ChevronDown size={16} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      {open &&
        buttonRef.current &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "absolute",
              top: buttonRef.current.getBoundingClientRect().bottom + window.scrollY + 8,
              left: buttonRef.current.getBoundingClientRect().left + window.scrollX,
              width: buttonRef.current.getBoundingClientRect().width,
            }}
            className="z-[1000] max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl"
            role="listbox"
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                disabled={option.disabled}
                className={cn(
                  "block w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
                  option.value === value && "bg-teal-50 font-bold text-teal-800",
                )}
                onClick={() => {
                  if (option.disabled) return;
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

export function CustomSelect({
  value,
  onChange,
  options,
  ariaLabel,
  compact = false,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  ariaLabel: string;
  className?: string;
  compact?: boolean;
}) {
  return (
    <SelectField
      value={value}
      onChange={onChange}
      ariaLabel={ariaLabel}
      compact={compact}
      className={className}
    >
      {options.map((option, index) => (
        <option
          key={option.value || `option-${index}`}
          value={option.value}
          disabled={option.disabled}
        >
          {option.label}
        </option>
      ))}
    </SelectField>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  required,
  type = "text",
  readOnly,
  hint,
  autoComplete,
  inputMode,
  className,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
  readOnly?: boolean;
  hint?: string;
  autoComplete?: string;
  inputMode?: "none" | "text" | "decimal" | "numeric" | "tel" | "search" | "email" | "url";
  className?: string;
}) {
  const labelId = useId();
  return (
    <div className="block">
      <span id={labelId} className="mb-2 block text-sm font-bold text-ink">
        {label}
        {required && <span className="ml-1 text-teal-700">*</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        required={required}
        autoComplete={autoComplete}
        inputMode={inputMode}
        aria-labelledby={labelId}
        className={cn(
          "min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-ink outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-2 focus:ring-teal-100",
          readOnly && "bg-slate-50 text-slate-500",
          className,
        )}
      />
      {hint && <span className="mt-1.5 block text-xs text-slate-400">{hint}</span>}
    </div>
  );
}

export function TopSearch({
  onSearch,
  value,
  placeholder = "Buscar por número, título, solicitante ou unidade",
  className,
}: {
  onSearch?: (value: string) => void;
  value?: string;
  placeholder?: string;
  className?: string;
}) {
  const [internalValue, setInternalValue] = useState("");
  const currentValue = value ?? internalValue;
  const update = (nextValue: string) => {
    setInternalValue(nextValue);
    onSearch?.(nextValue);
  };

  return (
    <div className={cn("relative max-w-sm", className)}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
      <input
        aria-label="Buscar"
        value={currentValue}
        onChange={(event) => update(event.target.value)}
        placeholder={placeholder}
        className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-10 text-sm outline-none transition hover:border-slate-300 focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
      />
      {currentValue && (
        <button
          type="button"
          aria-label="Limpar busca"
          onClick={() => update("")}
          className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
