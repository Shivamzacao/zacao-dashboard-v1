// Probes the Klaviyo resources the adapter uses. Read-only, bounded, no PII output.
import { loadEnvLocal, klaviyoGet } from "./lib.mjs";

const env = loadEnvLocal();

const probes = [
  ["accounts", "/api/accounts/"],
  ["metrics", "/api/metrics/"],
  ["flows", "/api/flows/?page[size]=10"],
  ["campaigns_email", "/api/campaigns/?filter=equals(messages.channel,'email')"],
  ["campaigns_sms", "/api/campaigns/?filter=equals(messages.channel,'sms')"],
  ["events_presence", "/api/events/?page[size]=1"],
];

let failures = 0;
for (const [name, path] of probes) {
  const { status, body } = await klaviyoGet(env, path);
  if (status !== 200) {
    failures += 1;
    console.log(`✗ ${name}: HTTP ${status} ${JSON.stringify(body?.errors?.[0]?.detail ?? "")}`);
    continue;
  }
  const count = Array.isArray(body?.data) ? body.data.length : 1;
  console.log(`✓ ${name}: HTTP 200, records=${count}`);
}

const metricId = env.KLAVIYO_CONVERSION_METRIC_ID;
const { status: metricStatus } = await klaviyoGet(env, `/api/metrics/${metricId}/`);
console.log(
  metricStatus === 200
    ? `✓ conversion metric ${metricId}: exists`
    : `✗ conversion metric ${metricId}: HTTP ${metricStatus}`,
);
if (metricStatus !== 200) failures += 1;

console.log(failures === 0 ? "ALL KLAVIYO PROBES OK" : `${failures} probe(s) failed`);
process.exit(failures === 0 ? 0 : 1);
