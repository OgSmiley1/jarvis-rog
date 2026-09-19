import { androidTools } from './androidTools';
import { termuxTools } from './termuxTools';
import type { ToolDefinition } from './types';

const definitions = [...androidTools, ...termuxTools];
export const toolRegistry = new Map<string, ToolDefinition>(definitions.map((tool) => [tool.name, tool]));

export function listToolSchemas() {
  return definitions.map((tool) => ({
    name: tool.name,
    description: tool.description,
    target: tool.target,
    confirmation: tool.confirmation,
  }));
}
