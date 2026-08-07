import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.join(process.cwd(), "src", "infrastructure", "google");
const violations = [];

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) => {
        const file = path.join(directory, entry.name);
        return entry.isDirectory() ? files(file) : /\.[cm]?[jt]s$/.test(entry.name) ? [file] : [];
      }),
    )
  ).flat();
}

for (const file of await files(root)) {
  const source = await readFile(file, "utf8");
  if (/method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/.test(source)) {
    violations.push(`${path.relative(process.cwd(), file)}: write HTTP method`);
  }
  if (/auth\/(?:spreadsheets|drive)(?!\.readonly)/.test(source)) {
    violations.push(`${path.relative(process.cwd(), file)}: non-read-only Google scope`);
  }
  if (
    /(?:batchUpdate|appendCells|appendValues|updateCells|deleteDimension|addSheet|\/permissions|\/upload\/)/i.test(
      source,
    ) &&
    !file.endsWith("client.ts")
  ) {
    violations.push(`${path.relative(process.cwd(), file)}: write-capable Google operation`);
  }
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Google read-only static check passed.");
}
