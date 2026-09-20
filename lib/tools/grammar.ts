/**
 * GBNF grammar generation for constrained tool calling.
 *
 * Asking a small local model for JSON and then parsing whatever comes back is
 * the usual source of tool-routing failures: prose around the object, a
 * trailing comma, a hallucinated tool name, or the model narrating instead of
 * emitting. llama.rn accepts a GBNF grammar, which constrains the sampler
 * itself, so tokens that would break the shape are never selected.
 *
 * What the grammar guarantees:
 *   - the output is a single, complete, parseable JSON object;
 *   - it has exactly the keys `tool` and `arguments`;
 *   - `tool` is one of the registered tool names, so a tool outside the
 *     allowlist cannot be emitted at all.
 *
 * What it deliberately does NOT guarantee: that the arguments satisfy a given
 * tool's schema. Arguments are constrained to valid JSON, and zod still
 * validates them in the router. The grammar removes the parsing failure mode;
 * it does not replace validation, and the executor allowlist remains the
 * security boundary.
 */

/** Escapes a string for use as a GBNF literal. */
function gbnfLiteral(value: string): string {
  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"\\"${escaped}\\""`;
}

/**
 * Builds a GBNF grammar that admits exactly one tool call drawn from
 * `toolNames`.
 *
 * Throws when given no tools: a grammar with an empty alternation would be
 * invalid, and silently allowing any tool name is precisely the failure this
 * exists to prevent.
 */
export function buildToolCallGrammar(toolNames: readonly string[]): string {
  const unique = [...new Set(toolNames)].filter((name) => name.trim().length > 0);
  if (unique.length === 0) throw new Error('TOOL_GRAMMAR_EMPTY_REGISTRY');

  const toolAlternation = unique.map(gbnfLiteral).join(' | ');

  return [
    'root ::= "{" ws "\\"tool\\"" ws ":" ws tool ws "," ws "\\"arguments\\"" ws ":" ws object ws "}"',
    `tool ::= ${toolAlternation}`,
    'object ::= "{" ws ( member ( ws "," ws member )* )? ws "}"',
    'member ::= string ws ":" ws value',
    'array ::= "[" ws ( value ( ws "," ws value )* )? ws "]"',
    'value ::= object | array | string | number | "true" | "false" | "null"',
    'string ::= "\\"" char* "\\""',
    'char ::= [^"\\\\] | "\\\\" escape',
    'escape ::= ["\\\\/bfnrt] | "u" hex hex hex hex',
    'hex ::= [0-9a-fA-F]',
    'number ::= "-"? int frac? exp?',
    'int ::= "0" | [1-9] [0-9]*',
    'frac ::= "." [0-9]+',
    'exp ::= [eE] [-+]? [0-9]+',
    'ws ::= [ \\t\\n\\r]*',
  ].join('\n');
}

export interface ParsedToolCall {
  tool: string;
  arguments: Record<string, unknown>;
}

/**
 * Parses a grammar-constrained tool call.
 *
 * Even with a grammar this stays strict, because the same routine is used when
 * a grammar was unavailable (an older runtime, or a non-llama backend) and
 * because a malformed call must fail loudly rather than execute something
 * approximate.
 */
export function parseToolCall(raw: string, allowedTools: readonly string[]): ParsedToolCall {
  const text = raw.trim();
  if (!text) throw new Error('TOOL_CALL_EMPTY');

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('TOOL_CALL_NOT_JSON');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('TOOL_CALL_NOT_OBJECT');
  }

  const candidate = parsed as Record<string, unknown>;
  const tool = candidate.tool;
  if (typeof tool !== 'string' || tool.trim().length === 0) throw new Error('TOOL_CALL_MISSING_TOOL');

  // The allowlist is re-checked here rather than trusted from the grammar, so
  // a call that reached this function another way cannot bypass it.
  if (!allowedTools.includes(tool)) throw new Error('UNKNOWN_TOOL');

  const args = candidate.arguments;
  if (args === undefined) return { tool, arguments: {} };
  if (typeof args !== 'object' || args === null || Array.isArray(args)) {
    throw new Error('TOOL_CALL_ARGUMENTS_NOT_OBJECT');
  }

  return { tool, arguments: args as Record<string, unknown> };
}
