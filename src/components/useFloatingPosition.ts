import { useLayoutEffect, useState, type RefObject } from "react";

const GAP = 8;
const VIEWPORT_MARGIN = 8;

type FloatingPlacement = "auto" | "bottom";
type FloatingPosition = { top: number; left: number; width: number; maxHeight: number };

export function useFloatingPosition(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  floatingRef?: RefObject<HTMLElement | null>,
  placement: FloatingPlacement = "auto",
) {
  const [position, setPosition] = useState<FloatingPosition | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    let frame = 0;
    const update = () => {
      const element = ref.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const floatingHeight = floatingRef?.current?.getBoundingClientRect().height ?? 0;
      const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - GAP - VIEWPORT_MARGIN);
      const spaceAbove = Math.max(0, rect.top - GAP - VIEWPORT_MARGIN);
      const placeAbove =
        placement === "auto" && floatingHeight > spaceBelow && spaceAbove > spaceBelow;
      const maxHeight = placeAbove ? spaceAbove : spaceBelow;
      const top = placeAbove
        ? rect.top + window.scrollY - Math.min(floatingHeight, spaceAbove) - GAP
        : rect.bottom + window.scrollY + GAP;
      const next = { top, left: rect.left + window.scrollX, width: rect.width, maxHeight };
      setPosition((current) =>
        current &&
        current.top === next.top &&
        current.left === next.left &&
        current.width === next.width &&
        current.maxHeight === next.maxHeight
          ? current
          : next,
      );
    };
    const scheduleUpdate = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };
    const handleScroll = (event: Event) => {
      if (
        event.target === document ||
        event.target === document.documentElement ||
        event.target === document.body
      )
        return;
      scheduleUpdate();
    };
    scheduleUpdate();
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", handleScroll, true);

    const resizeObserver = new ResizeObserver(scheduleUpdate);
    for (let ancestor = ref.current; ancestor; ancestor = ancestor.parentElement) {
      resizeObserver.observe(ancestor);
    }
    if (floatingRef?.current) resizeObserver.observe(floatingRef.current);

    const mutationObserver = new MutationObserver(scheduleUpdate);
    mutationObserver.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ["class", "style", "hidden"],
    });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", handleScroll, true);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [open, ref, floatingRef, placement]);

  return position;
}
