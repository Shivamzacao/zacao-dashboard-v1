"use client";

import { useEffect, useRef } from "react";

import type { DisplayState } from "./display-contracts";
import { StateSurface } from "./state-surface";

interface DetailDrawerProps {
  readonly open: boolean;
  readonly title: string;
  readonly state: DisplayState;
  readonly onClose: () => void;
  readonly children?: React.ReactNode;
  readonly returnFocusRef?: React.RefObject<HTMLElement | null>;
}

export function DetailDrawer({
  open,
  title,
  state,
  onClose,
  children,
  returnFocusRef,
}: DetailDrawerProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open) {
      closeRef.current?.focus();
    } else if (wasOpenRef.current) {
      returnFocusRef?.current?.focus();
    }
    wasOpenRef.current = open;
  }, [open, returnFocusRef]);
  useEffect(() => {
    if (!open) return;
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [open, onClose]);
  if (!open) return null;
  const contentState: Exclude<DisplayState, "current"> | null =
    state === "current" || state === "partial" || state === "stale" ? null : state;
  return (
    <div className="drawer-layer">
      <button
        className="drawer-scrim"
        type="button"
        onClick={onClose}
        aria-label="Close detail drawer"
      />
      <aside
        className="detail-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-drawer-title"
      >
        <header>
          <div>
            <p className="card-eyebrow">Drill-down</p>
            <h2 id="detail-drawer-title">{title}</h2>
          </div>
          <button ref={closeRef} type="button" className="drawer-close" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="drawer-content">
          {contentState ? <StateSurface state={contentState} /> : children}
        </div>
      </aside>
    </div>
  );
}
