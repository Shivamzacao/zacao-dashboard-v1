import { importApiHandlers } from "@/src/infrastructure/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return importApiHandlers.commit(request);
}
