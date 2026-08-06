/**
 * Next.js 16.3 references these URLPattern aliases globally, while the pinned
 * Node 24 type line exposes URLPatternInit globally but keeps these two names
 * module-scoped. This type-only bridge can be removed when upstream aligns.
 */
type URLPatternInput = string | URLPatternInit;

interface URLPatternOptions {
  readonly ignoreCase?: boolean;
}
