import { apiHandlers } from "@/src/infrastructure/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { readonly params: Promise<{ readonly dashboard: string }> },
): Promise<Response> {
  const { dashboard } = await context.params;
  return apiHandlers.dashboard(request, dashboard);
}
