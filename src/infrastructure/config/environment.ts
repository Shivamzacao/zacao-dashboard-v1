import "server-only";

import { parseServerEnvironment } from "./environment-schema";

export const serverEnvironment = parseServerEnvironment({
  NODE_ENV: process.env.NODE_ENV,
  REPORTING_TIMEZONE: process.env["REPORTING_TIMEZONE"],
  REPORTING_CURRENCY: process.env["REPORTING_CURRENCY"],
});
