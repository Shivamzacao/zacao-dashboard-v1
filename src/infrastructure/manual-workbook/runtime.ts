import "server-only";

import { z } from "zod";

import type { ManualStoreConfiguration } from "./store";

const configurationSchema = z
  .object({
    databaseUrl: z
      .string()
      .trim()
      .regex(/^postgres(ql)?:\/\//, "DATABASE_URL must be a postgres:// connection string"),
  })
  .strict();

export function loadManualWorkbookConfigurationOrNull(): ManualStoreConfiguration | null {
  const databaseUrl = process.env["DATABASE_URL"];
  if (databaseUrl === undefined || databaseUrl === "") return null;
  return configurationSchema.parse({ databaseUrl });
}
