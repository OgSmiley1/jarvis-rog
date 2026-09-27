import { z } from 'zod';
import type { ToolDefinition } from './types';
import { callTermux } from './termuxClient';

export const termuxTools: ToolDefinition[] = [
  {
    name: 'termux.app_open',
    description: 'Open an Android application by a validated package name through the authenticated local Termux bridge.',
    target: 'TERMUX',
    confirmation: 'none',
    schema: z.object({ package: z.string().regex(/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)+$/) }),
    execute: async ({ package: packageName }) => callTermux('app.open', { package: packageName }),
  },
  {
    name: 'termux.system_status',
    description: 'Read safe status information from the local Termux bridge.',
    target: 'TERMUX',
    confirmation: 'none',
    schema: z.object({}),
    execute: async () => callTermux('system.status'),
  },
  {
    name: 'termux.git_status',
    description: 'Read git status for an explicitly supplied repository path.',
    target: 'TERMUX',
    confirmation: 'none',
    schema: z.object({ path: z.string().min(1).max(500) }),
    execute: async ({ path }) => callTermux('git.status', { path }),
  },
];
