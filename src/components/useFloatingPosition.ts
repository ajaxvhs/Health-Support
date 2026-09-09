import { useLayoutEffect, useState, type RefObject } from "react";

export function useFloatingPosition(ref: RefObject<HTMLElement | null>, open: boolean) {
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const update = () => {
      const element = ref.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      setPosition({
        top: rect.bottom + window.scrollY + 8,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    };
    update();
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
    };
  }, [open, ref]);

  return position;
}
