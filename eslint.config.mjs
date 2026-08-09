import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const domainForbiddenImports = [
  "next",
  "next/*",
  "react",
  "react/*",
  "@/src/application/*",
  "@/src/infrastructure/*",
  "@/src/presentation/*",
];

export default defineConfig([
  ...nextCoreWebVitals,
  ...nextTypeScript,
  // `.claude/worktrees` holds throwaway checkouts of this same repository, so
  // linting it re-reports every file (plus generated output) from a second
  // copy and fails the gate on code that is not in this tree.
  globalIgnores([".next/**", ".claude/**", "coverage/**", "docs/**", "node_modules/**"]),
  {
    rules: {
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "no-restricted-syntax": [
        "error",
        {
          selector: "TSAsExpression > TSAnyKeyword",
          message: "Do not bypass contracts with an any assertion.",
        },
      ],
    },
  },
  {
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: domainForbiddenImports.slice(0, 3).map((name) => ({
            name,
            message: "Domain code must remain framework-independent.",
          })),
          patterns: domainForbiddenImports.slice(3),
        },
      ],
    },
  },
  {
    files: ["src/application/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: ["@/src/infrastructure/*", "@/src/presentation/*"],
        },
      ],
    },
  },
  {
    files: ["src/**/*.client.ts", "src/**/*.client.tsx", "src/presentation/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: ["@/src/infrastructure/config/*", "@/src/infrastructure/sources/*"],
        },
      ],
    },
  },
]);
