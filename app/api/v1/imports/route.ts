import { importApiHandlers } from "@/src/infrastructure/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return importApiHandlers.history(request);
}
