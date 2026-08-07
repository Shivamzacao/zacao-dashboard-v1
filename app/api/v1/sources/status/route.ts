import { apiHandlers } from "@/src/infrastructure/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request): Promise<Response> {
  return apiHandlers.sourceStatus(request);
}
