import type { UnderstandMode } from './communicationIntelligence';

export type CommandRoute =
  | { type: 'understand'; mode: UnderstandMode; text: string }
  | { type: 'project' }
  | { type: 'memory' }
  | { type: 'status' }
  | { type: 'chat'; text: string };

export function routeCommand(input: string): CommandRoute {
  const trimmed = input.trim();
  const match = /^\/(analyse|draft|plan)\s+([\s\S]+)$/i.exec(trimmed);
  const command = match?.[1];
  const commandText = match?.[2];

  if (command && commandText) {
    return {
      type: 'understand',
      mode: command.toLowerCase() as UnderstandMode,
      text: commandText.trim(),
    };
  }

  if (/^\/project\s*$/i.test(trimmed)) return { type: 'project' };
  if (/^\/memory\s*$/i.test(trimmed)) return { type: 'memory' };
  if (/^\/status\s*$/i.test(trimmed)) return { type: 'status' };
  return { type: 'chat', text: input };
}
