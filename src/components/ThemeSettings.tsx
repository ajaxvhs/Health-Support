import { Moon, Sun } from "lucide-react";
import { useTheme } from "../context/useTheme";
import { cn } from "../lib/utils";
import type { ThemePreference } from "../lib/theme";

const options: Array<{
  value: ThemePreference;
  label: string;
  description: string;
  icon: typeof Sun;
}> = [
  { value: "light", label: "Claro", description: "Tema claro", icon: Sun },
  { value: "dark", label: "Escuro", description: "Tema escuro", icon: Moon },
];

export function ThemeSettings() {
  const { preference, setPreference } = useTheme();
  return (
    <section className="rounded-2xl border border-line-soft bg-surface p-5 shadow-soft sm:p-6">
      <h2 className="font-bold text-ink">Aparência</h2>
      <p className="mt-2 text-sm leading-6 text-muted">
        Escolha como o portal deve aparecer neste dispositivo.
      </p>
      <div className="mt-5 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tema do portal">
        {options.map(({ value, label, description, icon: Icon }) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={preference === value}
            onClick={() => setPreference(value)}
            className={cn(
              "flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border px-2 py-3 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
              preference === value
                ? "border-brand-focus bg-brand-soft text-brand-contrast"
                : "border-line text-muted hover:border-brand-hover hover:bg-surface-soft hover:text-ink",
            )}
          >
            <Icon size={18} aria-hidden="true" />
            <span className="text-xs font-bold">{label}</span>
            <span className="text-[10px] text-subtle">{description}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
