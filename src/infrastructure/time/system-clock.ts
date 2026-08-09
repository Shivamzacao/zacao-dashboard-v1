import type { ClockPort } from "@/src/application/ports";

export class SystemClock implements ClockPort {
  now(): Date {
    return new Date();
  }
}
