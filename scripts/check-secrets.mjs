import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import process from "node:process";

const trackedFiles = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean)
  .filter((file) => !file.endsWith(".docx"));

const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  // Horizontal-only whitespace: `\s*` would span the newline after an empty
  // `KEY=` placeholder and match the following line's name as its "value".
  /(?:SHOPIFY_ADMIN_ACCESS_TOKEN|KLAVIYO_PRIVATE_API_KEY|SHOPIFY_CLIENT_SECRET|GOOGLE_PRIVATE_KEY|SUPABASE_SERVICE_ROLE_KEY|DATABASE_URL|DATABASE_MIGRATE_URL)[^\S\n]*=[^\S\n]*[^\s#][^\n]*/,
  /\bshpat_[A-Za-z0-9]{20,}\b/,
  /\bpk_[A-Za-z0-9]{20,}\b/,
];

const findings = [];
for (const file of trackedFiles) {
  const content = await readFile(file, "utf8").catch(() => "");
  if (patterns.some((pattern) => pattern.test(content))) findings.push(file);
}

if (findings.length > 0) {
  console.error(`Potential secret material detected in: ${findings.join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("Tracked-file secret check passed.");
}
