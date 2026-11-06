export type PromptOptimizationMode = "off" | "clean";

export interface ModeSetting {
  mode: PromptOptimizationMode;
  invalid: boolean;
}

export interface OptimizationResult {
  text: string;
  fallback?: "empty-result" | "error";
}

const MODES = ["off", "clean"] as const;
const STRUCTURED_CONTENT = [
  /```|`[^`\n]+`/,
  /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|“[^”]*”|‘[^’]*’/,
  /(?:^|\s)(?:~\/|\.{1,2}\/|\/)[^\s,;]+|(?:^|\s)[A-Za-z]:\\[^\s,;]+/,
  /\b[\w.-]+\/[\w./-]+|\b[\w.-]+\.(?:ts|tsx|js|jsx|mjs|cjs|py|rs|go|cpp|cc|h|hpp|json|yaml|yml|toml|sh|sql|md|txt)\b/i,
  /\b[a-z][A-Z]\w*\b|\b[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+\b|\b\w+_\w+\b|\b[A-Za-z_$][\w$]*\s*\(/,
  /(?:^|[\n:;])\s*(?:\$|>)?\s*(?:git|npm|pnpm|yarn|node|python|pip|cmake|cargo|docker)\b/im,
  /^\s*(?:\{[\s\S]*\}|\[[\s\S]*\])\s*$/,
];

export function hasStructuredContent(text: string): boolean {
  return STRUCTURED_CONTENT.some((pattern) => pattern.test(text));
}

export function resolveOptimizationMode(explicit: string | undefined, legacyCleanup: string | undefined): ModeSetting {
  if (explicit === undefined) return { mode: legacyCleanup === "1" ? "clean" : "off", invalid: false };
  const value = explicit.trim().toLowerCase();
  if ((MODES as readonly string[]).includes(value)) return { mode: value as PromptOptimizationMode, invalid: false };
  return { mode: "off", invalid: true };
}

export function normalizeTranscript(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// shortcut: remove only recognized fillers and immediate pronoun repeats, add patterns only for confirmed disfluencies.
export function cleanDisfluencies(text: string, language: string): string {
  if (hasStructuredContent(text)) return text;
  const locale = language.toLowerCase();
  const fillers = ["h+m+"];
  if (locale === "auto" || locale.startsWith("pt")) fillers.push("a+h+n+", "a+h+m+");
  // "hum" is also an English verb/noun; auto must preserve it.
  if (locale.startsWith("pt")) fillers.push("h+u+m+");
  if (locale === "auto" || locale.startsWith("en")) fillers.push("u+h+", "e+r+m+");
  if (locale.startsWith("en")) fillers.push("u+m+", "e+r+");
  const startsWithFiller = new RegExp(`^\\s*(?:${fillers.join("|")})(?![\\p{L}\\p{N}_]|-[\\p{L}])[,;.!?…]*\\s*`, "iu").test(text);
  let cleaned = text.replace(
    new RegExp(`(?<![\\p{L}\\p{N}_])(?:${fillers.join("|")})(?![\\p{L}\\p{N}_]|-[\\p{L}])[,;.!?…]*\\s*`, "giu"),
    "",
  );
  const pronouns = "I|we|you|he|she|it|they|eu|tu|você|ele|ela|nós|vocês|eles|elas";
  cleaned = cleaned.replace(
    new RegExp(`(?<![\\p{L}\\p{N}_])(${pronouns})(?![\\p{L}\\p{N}_])(?:(?:\\s*[,;]\\s*|\\s+|-)\\1)+(?![\\p{L}\\p{N}_])`, "giu"),
    "$1",
  );
  cleaned = cleaned.replace(/[ \t]{2,}/g, " ").replace(/\s+([,.;!?])/g, "$1").trim();
  return startsWithFiller ? cleaned.replace(/^(\p{Ll})/u, (letter) => letter.toUpperCase()) : cleaned;
}

export function optimizeTranscript(
  text: string,
  mode: PromptOptimizationMode,
  language: string,
  cleaner: (text: string, language: string) => string = cleanDisfluencies,
): OptimizationResult {
  const preservedStructuredText = /[\r\n]/.test(text) || hasStructuredContent(text);
  const original = preservedStructuredText && mode !== "off" ? text.trim() : normalizeTranscript(text);
  if (mode === "off") return { text: original };
  if (preservedStructuredText) return { text: original };
  try {
    const cleaned = normalizeTranscript(cleaner(original, language));
    if (original && !cleaned) return { text: original, fallback: "empty-result" };
    return { text: cleaned };
  } catch {
    return { text: original, fallback: "error" };
  }
}
