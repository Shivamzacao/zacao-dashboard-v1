import { apiHandlers } from "@/src/infrastructure/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { readonly params: Promise<{ readonly dataset: string }> },
): Promise<Response> {
  const { dataset } = await context.params;
  return apiHandlers.exportCsv(request, dataset);
}
