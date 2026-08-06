import type { SourceKey } from "@/src/domain/contracts";

export interface RefreshRequest {
  readonly source: SourceKey;
  readonly requestedAt: string;
  readonly reason: "scheduled" | "manual" | "cache_miss";
}

export interface RefreshSchedulerPort {
  requestRefresh(request: RefreshRequest): Promise<void>;
}
