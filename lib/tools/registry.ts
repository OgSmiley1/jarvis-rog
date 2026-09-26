import { androidTools } from './androidTools';
import { buildToolCallGrammar } from './grammar';
import { phoneTools } from './phoneTools';
import { visionTools } from './visionTools';
import { utilityTools } from './utilityTools';
import { termuxTools } from './termuxTools';
import type { ToolDefinition } from './types';

const definitions = [...androidTools, ...phoneTools, ...visionTools, ...utilityTools, ...termuxTools];
export const toolRegistry = new Map<string, ToolDefinition>(definitions.map((tool) => [tool.name, tool]));

export function listToolSchemas() {
  return definitions.map((tool) => ({
    name: tool.name,
    description: tool.description,
    target: tool.target,
    confirmation: tool.confirmation,
  }));
}

/** Every registered tool name. The allowlist, in one place. */
export function listToolNames(): string[] {
  return definitions.map((tool) => tool.name);
}

/**
 * GBNF grammar admitting exactly one call to a registered tool. Derived from
 * the registry itself, so a tool added or removed here cannot drift out of
 * sync with what the sampler is allowed to emit.
 */
export function toolCallGrammar(): string {
  return buildToolCallGrammar(listToolNames());
}
