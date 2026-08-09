import { randomUUID } from "node:crypto";

import { ZodError, type ZodType } from "zod";

import { ApiQueryError } from "@/src/application/api";
import type { CacheMetadata, SourceStatus } from "@/src/domain/contracts";
import { apiProblemSchema, apiSuccessSchema, type ApiProblem } from "@/src/domain/contracts";

export const PRIVATE_API_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

export function successResponse<T>(input: {
  readonly data: T;
  readonly dataSchema: ZodType<T>;
  readonly cache: CacheMetadata;
  readonly sources: readonly SourceStatus[];
  readonly requestId?: string;
}): Response {
  const body = apiSuccessSchema(input.dataSchema).parse({
    ok: true,
    data: input.data,
    meta: {
      schemaVersion: "1.0",
      requestId: input.requestId ?? randomUUID(),
      cache: input.cache,
      sources: input.sources,
    },
  });
  return Response.json(body, { headers: PRIVATE_API_HEADERS });
}

function problemFor(error: unknown, requestId: string): ApiProblem {
  if (error instanceof ZodError) {
    return apiProblemSchema.parse({
      type: "https://zacao.com/problems/invalid-request",
      title: "Invalid request",
      status: 400,
      code: "INVALID_REQUEST",
      detail: "One or more request values are invalid.",
      requestId,
      errors: error.issues.map((issue) => ({ path: issue.path, message: issue.message })),
    });
  }
  if (error instanceof ApiQueryError) {
    return apiProblemSchema.parse({
      type: "https://zacao.com/problems/invalid-request",
      title: "Invalid request",
      status: 400,
      code: "INVALID_REQUEST",
      detail: error.message,
      requestId,
      errors: [{ path: [...error.path], message: error.message }],
    });
  }
  return apiProblemSchema.parse({
    type: "https://zacao.com/problems/internal-error",
    title: "Internal error",
    status: 500,
    code: "INTERNAL_ERROR",
    detail: "The request could not be completed.",
    requestId,
    errors: [],
  });
}

export function problemResponse(error: unknown, requestId = randomUUID()): Response {
  const problem = problemFor(error, requestId);
  return new Response(JSON.stringify(problem), {
    status: problem.status,
    headers: {
      ...PRIVATE_API_HEADERS,
      "Content-Type": "application/problem+json",
    },
  });
}
