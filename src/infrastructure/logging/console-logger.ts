import "server-only";

import type { LogContext, LoggerPort } from "@/src/application/ports";

type Level = "debug" | "info" | "warn" | "error";

/**
 * Minimal structured logger for server-side diagnostics. Emits one JSON line
 * per event so orchestration failures stay greppable in `next dev` output and
 * in production logs alike.
 */
export class ConsoleLogger implements LoggerPort {
  constructor(private readonly write: (line: string) => void = console.error) {}

  debug(event: string, context?: LogContext): void {
    this.emit("debug", event, context);
  }

  info(event: string, context?: LogContext): void {
    this.emit("info", event, context);
  }

  warn(event: string, context?: LogContext): void {
    this.emit("warn", event, context);
  }

  error(event: string, context?: LogContext): void {
    this.emit("error", event, context);
  }

  private emit(level: Level, event: string, context?: LogContext): void {
    this.write(JSON.stringify({ level, event, ...(context ?? {}) }));
  }
}
