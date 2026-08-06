import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, "src");
const violations = [];

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(entryPath);
      return /\.[cm]?[jt]sx?$/.test(entry.name) ? [entryPath] : [];
    }),
  );
  return nested.flat();
}

for (const file of await sourceFiles(sourceRoot)) {
  const relative = path.relative(projectRoot, file);
  const content = await readFile(file, "utf8");

  if (
    relative.startsWith("src/domain/") &&
    /from ["'](?:next|react|@\/src\/(?:application|infrastructure|presentation))/.test(content)
  ) {
    violations.push(`${relative}: domain dependency points outward`);
  }

  if (
    relative.startsWith("src/application/") &&
    /from ["']@\/src\/(?:infrastructure|presentation)/.test(content)
  ) {
    violations.push(`${relative}: application dependency points outward`);
  }

  const isClientBoundary =
    /\.client\.[jt]sx?$/.test(relative) || relative.startsWith("src/presentation/");
  if (isClientBoundary && /process\.env|@\/src\/infrastructure\/config/.test(content)) {
    violations.push(`${relative}: client boundary can reach server environment`);
  }
}

if (violations.length > 0) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Boundary check passed.");
}
