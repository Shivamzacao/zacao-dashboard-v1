import "server-only";

import {
  parseKlaviyoConfiguration,
  REQUIRED_KLAVIYO_READ_SCOPES,
  type KlaviyoConfiguration,
} from "./config";
import { VERIFIED_KLAVIYO_METRICS } from "./metric-registry";

export function loadKlaviyoConfigurationOrNull(): KlaviyoConfiguration | null {
  const privateApiKey = process.env["KLAVIYO_PRIVATE_API_KEY"];
  const apiRevision = process.env["KLAVIYO_API_REVISION"];
  if (
    (privateApiKey === undefined || privateApiKey === "") &&
    (apiRevision === undefined || apiRevision === "")
  ) {
    return null;
  }

  const configuredConversionMetricId = process.env["KLAVIYO_CONVERSION_METRIC_ID"];
  if (configuredConversionMetricId !== undefined && configuredConversionMetricId !== "") {
    const placedOrder = VERIFIED_KLAVIYO_METRICS.find((metric) => metric.key === "placed_order");
    if (placedOrder && placedOrder.id !== configuredConversionMetricId) {
      throw new Error(
        "KLAVIYO_CONVERSION_METRIC_ID does not match the frozen placed_order metric registry entry",
      );
    }
  }

  return parseKlaviyoConfiguration({
    privateApiKey,
    apiRevision,
    grantedScopes: [...REQUIRED_KLAVIYO_READ_SCOPES],
    reportingTimeZone: "America/New_York",
    timeoutMs: 15_000,
    maxRetries: 2,
  });
}
