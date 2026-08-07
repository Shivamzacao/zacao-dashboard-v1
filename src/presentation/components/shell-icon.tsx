import type { ShellIconName } from "@/src/presentation/shell/routes";

type IconName = ShellIconName | "calendar" | "chevron" | "close" | "download" | "menu" | "source";

interface ShellIconProps {
  readonly name: IconName;
  readonly size?: number;
}

export function ShellIcon({ name, size = 18 }: ShellIconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "executive")
    return (
      <svg {...common}>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    );
  if (name === "revenue")
    return (
      <svg {...common}>
        <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />
      </svg>
    );
  if (name === "customers")
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5.5a3 3 0 0 1 0 5.5M18 14a5 5 0 0 1 3 4.5V20" />
      </svg>
    );
  if (name === "products")
    return (
      <svg {...common}>
        <path d="m12 2 8 4.5v9L12 20l-8-4.5v-9L12 2Z" />
        <path d="m4.5 6.8 7.5 4.3 7.5-4.3M12 11v9" />
      </svg>
    );
  if (name === "operations")
    return (
      <svg {...common}>
        <path d="M3 7h12v10H3zM15 10h3l3 3v4h-6z" />
        <circle cx="7" cy="18" r="2" />
        <circle cx="18" cy="18" r="2" />
      </svg>
    );
  if (name === "marketing")
    return (
      <svg {...common}>
        <path d="m3 11 15-6v14L3 13zM7 14l1.5 5h3" />
      </svg>
    );
  if (name === "growth")
    return (
      <svg {...common}>
        <path d="m3 18 6-6 4 3 7-9" />
        <path d="M15 6h5v5" />
      </svg>
    );
  if (name === "financial")
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 9h18M7 14h3" />
      </svg>
    );
  if (name === "insights")
    return (
      <svg {...common}>
        <path d="m12 2 1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2Z" />
        <path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" />
      </svg>
    );
  if (name === "calendar")
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M8 3v4M16 3v4M3 10h18" />
      </svg>
    );
  if (name === "download")
    return (
      <svg {...common}>
        <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
      </svg>
    );
  if (name === "menu")
    return (
      <svg {...common}>
        <path d="M4 7h16M4 12h16M4 17h16" />
      </svg>
    );
  if (name === "close")
    return (
      <svg {...common}>
        <path d="m6 6 12 12M18 6 6 18" />
      </svg>
    );
  if (name === "source")
    return (
      <svg {...common}>
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
      </svg>
    );
  return (
    <svg {...common}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
