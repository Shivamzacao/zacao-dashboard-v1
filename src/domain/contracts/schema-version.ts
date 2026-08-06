import { z } from "zod";

export const CONTRACT_SCHEMA_VERSION = "1.0" as const;
export const contractSchemaVersionSchema = z.literal(CONTRACT_SCHEMA_VERSION);

export type ContractSchemaVersion = z.infer<typeof contractSchemaVersionSchema>;
