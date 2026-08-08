// Vitest stand-in for the `server-only` package. The real package makes any
// browser-bundle import a build-time error in Next.js; in node-based tests the
// guard is inert so server-side runtime loaders can be unit tested.
export {};
