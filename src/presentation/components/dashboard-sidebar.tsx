"use client";

import { SidebarNavigation } from "./sidebar-navigation";
import { ShellIcon } from "./shell-icon";

interface DashboardSidebarProps {
  readonly open: boolean;
  readonly pathname: string;
  readonly query: string;
  readonly onClose: () => void;
}

export function DashboardSidebar({ open, pathname, query, onClose }: DashboardSidebarProps) {
  return (
    <>
      <button
        className="sidebar-scrim"
        type="button"
        aria-label="Close navigation"
        tabIndex={open ? 0 : -1}
        data-open={open}
        onClick={onClose}
      />
      <aside className="dashboard-sidebar" data-open={open} aria-label="ZACAO dashboard">
        <div className="brand-lockup" aria-label="ZACAO">
          <span className="brand-mark">Z</span>
          <span className="brand-word">ZACAO</span>
        </div>
        <button
          className="sidebar-close"
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
        >
          <ShellIcon name="close" />
        </button>
        <div className="workspace-tile">
          <span className="workspace-mark">ZI</span>
          <span>
            <strong>ZACAO Intelligence</strong>
            <small>Internal dashboard</small>
          </span>
        </div>
        <SidebarNavigation pathname={pathname} query={query} onNavigate={onClose} />
        <div className="sidebar-footer">
          <div className="sidebar-source-card">
            <span className="source-dot" />
            <span>
              <strong>Synthetic TEST data</strong>
              <small>B7 fixture validated</small>
            </span>
          </div>
          <div className="internal-workspace">
            <span className="internal-workspace-icon">
              <ShellIcon name="source" size={16} />
            </span>
            <span>
              <strong>ZACAO internal team</strong>
              <small>Read-only dashboard</small>
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}
