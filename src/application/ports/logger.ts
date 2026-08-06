export type LogValue = string | number | boolean | null;
export type LogContext = Readonly<Record<string, LogValue>>;

export interface LoggerPort {
  debug(event: string, context?: LogContext): void;
  info(event: string, context?: LogContext): void;
  warn(event: string, context?: LogContext): void;
  error(event: string, context?: LogContext): void;
}
