"use client";

import Link from "next/link";
import { useRef } from "react";

import { ShellIcon } from "./shell-icon";
import {
  dashboardRoutes,
  isDashboardRouteActive,
  utilityRoutes,
} from "@/src/presentation/shell/routes";

interface SidebarNavigationProps {
  readonly pathname: string;
  readonly query: string;
  readonly onNavigate?: () => void;
}

function moveFocus(current: HTMLElement, direction: "next" | "previous" | "first" | "last") {
  const nav = current.closest("nav");
  if (!nav) return;
  const links = [...nav.querySelectorAll<HTMLAnchorElement>("[data-dashboard-nav-link]")];
  const index = links.indexOf(current as HTMLAnchorElement);
  let target = index;
  if (direction === "next") target = (index + 1) % links.length;
  if (direction === "previous") target = (index - 1 + links.length) % links.length;
  if (direction === "first") target = 0;
  if (direction === "last") target = links.length - 1;
  links[target]?.focus();
}

export function SidebarNavigation({ pathname, query, onNavigate }: SidebarNavigationProps) {
  const navRef = useRef<HTMLElement>(null);

  return (
    <nav
      ref={navRef}
      className="sidebar-navigation"
      aria-label="Dashboard sections"
      onKeyDown={(event) => {
        if (!(event.target instanceof HTMLElement)) return;
        if (event.key === "ArrowDown") {
          event.preventDefault();
          moveFocus(event.target, "next");
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          moveFocus(event.target, "previous");
        } else if (event.key === "Home") {
          event.preventDefault();
          moveFocus(event.target, "first");
        } else if (event.key === "End") {
          event.preventDefault();
          moveFocus(event.target, "last");
        }
      }}
    >
      <p className="sidebar-section-label">Intelligence</p>
      <ul className="sidebar-navigation-list">
        {dashboardRoutes.map((route) => {
          const active = isDashboardRouteActive(pathname, route.href);
          return (
            <li key={route.slug}>
              <Link
                data-dashboard-nav-link
                className="sidebar-navigation-link"
                href={route.href + "?" + query}
                aria-current={active ? "page" : undefined}
                {...(onNavigate ? { onClick: onNavigate } : {})}
              >
                <ShellIcon name={route.icon} />
                <span>{route.title}</span>
                {route.availability === "conditional" ? (
                  <span className="sr-only">Conditional V1 section</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="sidebar-section-label">Data</p>
      <ul className="sidebar-navigation-list">
        {utilityRoutes.map((route) => (
          <li key={route.href}>
            <Link
              data-dashboard-nav-link
              className="sidebar-navigation-link"
              href={route.href}
              aria-current={isDashboardRouteActive(pathname, route.href) ? "page" : undefined}
              {...(onNavigate ? { onClick: onNavigate } : {})}
            >
              <ShellIcon name={route.icon} />
              <span>{route.title}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
