"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/** Distance kept between the trigger and the bubble, and between bubble and viewport edge. */
const ANCHOR_GAP = 8;
const VIEWPORT_MARGIN = 12;

// The bubble stays next to its trigger in the DOM — so it keeps the page's
// landmark structure — but is laid out with `position: fixed` against the
// trigger's viewport rect. Absolute positioning put it under `.kpi-card`'s
// `overflow: hidden`, which clipped every help bubble to a sliver.
type BubblePosition = { readonly top: number; readonly left: number };

/** `useLayoutEffect` warns when React renders on the server; effects never run there anyway. */
const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** closed → no bubble; hover → opened by pointer or focus; pinned → opened by click or key. */
type TriggerState = "closed" | "hover" | "pinned";

interface TooltipProps {
  /** The explanatory copy shown in the bubble. */
  readonly label: string;
  /** Visible trigger content. Provide `accessibleName` when this is only a glyph. */
  readonly children: ReactNode;
  /** Overrides the name announced for the trigger when the visible glyph says nothing. */
  readonly accessibleName?: string;
  readonly className?: string;
}

/**
 * A trigger that reveals `label` on hover, focus, click, and tap, and hides it
 * on Escape, blur, outside press, or pointer-out. Every disclosure path is
 * wired because the previous help marker relied on a native `title`, which
 * never appears on touch and takes a second of hover on a mouse.
 */
export function Tooltip({ label, children, accessibleName, className }: TooltipProps) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const bubbleRef = useRef<HTMLSpanElement | null>(null);
  const [state, setState] = useState<TriggerState>("closed");
  const [position, setPosition] = useState<BubblePosition>({ top: 0, left: 0 });
  const open = state !== "closed";

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    const bubble = bubbleRef.current;
    if (!trigger || !bubble) return;
    const anchor = trigger.getBoundingClientRect();
    const box = bubble.getBoundingClientRect();
    const rightLimit = Math.max(VIEWPORT_MARGIN, window.innerWidth - box.width - VIEWPORT_MARGIN);
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, anchor.left + anchor.width / 2 - box.width / 2),
      rightLimit,
    );
    const below = anchor.bottom + ANCHOR_GAP;
    const above = anchor.top - ANCHOR_GAP - box.height;
    // Flip above the trigger only when the bubble would overflow the viewport
    // bottom and there is genuinely room overhead.
    const overflowsBelow = below + box.height + VIEWPORT_MARGIN > window.innerHeight;
    setPosition({ top: overflowsBelow && above >= VIEWPORT_MARGIN ? above : below, left });
  }, []);

  useIsomorphicLayoutEffect(() => {
    if (open) place();
  }, [open, place, label]);

  useEffect(() => {
    if (!open) return;
    const close = () => setState("closed");
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        triggerRef.current?.focus();
      }
    };
    const onPointerDown = (event: Event) => {
      const target = event.target as Node | null;
      if (target && triggerRef.current?.contains(target)) return;
      close();
    };
    const reposition = () => place();
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("resize", reposition);
    // Capture phase so scrolling any ancestor — not just the window — moves the bubble with it.
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, place]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={className}
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        {...(accessibleName ? { "aria-label": accessibleName } : {})}
        onClick={() => setState((current) => (current === "pinned" ? "closed" : "pinned"))}
        onMouseEnter={() => setState((current) => (current === "closed" ? "hover" : current))}
        onMouseLeave={() => setState((current) => (current === "hover" ? "closed" : current))}
        onFocus={() => setState((current) => (current === "closed" ? "hover" : current))}
        onBlur={() => setState("closed")}
      >
        {children}
      </button>
      {open ? (
        <span
          ref={bubbleRef}
          className="tooltip-content"
          role="tooltip"
          id={id}
          style={{ top: position.top, left: position.left }}
        >
          {label}
        </span>
      ) : null}
    </>
  );
}
