import { describe, expect, it } from 'vitest';
import { buildToolCallGrammar, parseToolCall } from '@/lib/tools/grammar';

const TOOLS = ['device.open_url', 'termux.system_status'] as const;

describe('buildToolCallGrammar', () => {
  it('pins the tool name to the registered allowlist', () => {
    const grammar = buildToolCallGrammar(TOOLS);
    expect(grammar).toContain('\\"device.open_url\\"');
    expect(grammar).toContain('\\"termux.system_status\\"');
    expect(grammar).not.toContain('danger.execute_anything');
  });

  it('requires both the tool and arguments keys', () => {
    const grammar = buildToolCallGrammar(TOOLS);
    expect(grammar).toContain('\\"tool\\"');
    expect(grammar).toContain('\\"arguments\\"');
  });

  it('defines every rule it references, so the grammar is self-contained', () => {
    const grammar = buildToolCallGrammar(TOOLS);
    const defined = new Set(
      grammar
        .split('\n')
        .map((line) => line.split('::=')[0]?.trim())
        .filter((name): name is string => Boolean(name)),
    );
    for (const rule of ['root', 'tool', 'object', 'member', 'array', 'value', 'string', 'number', 'ws']) {
      expect(defined).toContain(rule);
    }
  });

  it('deduplicates repeated tool names', () => {
    const grammar = buildToolCallGrammar(['a.b', 'a.b']);
    const toolLine = grammar.split('\n').find((line) => line.startsWith('tool ::='));
    expect(toolLine).toBe('tool ::= "\\"a.b\\""');
  });

  it('refuses to build a grammar with no tools rather than allowing any name', () => {
    expect(() => buildToolCallGrammar([])).toThrow('TOOL_GRAMMAR_EMPTY_REGISTRY');
    expect(() => buildToolCallGrammar(['   '])).toThrow('TOOL_GRAMMAR_EMPTY_REGISTRY');
  });
});

describe('parseToolCall', () => {
  it('parses a well-formed call', () => {
    const call = parseToolCall('{"tool":"device.open_url","arguments":{"url":"https://a.test"}}', TOOLS);
    expect(call).toEqual({ tool: 'device.open_url', arguments: { url: 'https://a.test' } });
  });

  it('treats omitted arguments as an empty object', () => {
    expect(parseToolCall('{"tool":"termux.system_status"}', TOOLS).arguments).toEqual({});
  });

  it('re-checks the allowlist rather than trusting the grammar', () => {
    expect(() => parseToolCall('{"tool":"danger.execute_anything","arguments":{}}', TOOLS)).toThrow('UNKNOWN_TOOL');
  });

  it('rejects prose around the object instead of salvaging it', () => {
    expect(() => parseToolCall('Sure! {"tool":"device.open_url","arguments":{}}', TOOLS)).toThrow('TOOL_CALL_NOT_JSON');
  });

  it('rejects empty, non-object and array payloads', () => {
    expect(() => parseToolCall('', TOOLS)).toThrow('TOOL_CALL_EMPTY');
    expect(() => parseToolCall('"a string"', TOOLS)).toThrow('TOOL_CALL_NOT_OBJECT');
    expect(() => parseToolCall('[{"tool":"device.open_url"}]', TOOLS)).toThrow('TOOL_CALL_NOT_OBJECT');
  });

  it('rejects a missing or non-string tool name', () => {
    expect(() => parseToolCall('{"arguments":{}}', TOOLS)).toThrow('TOOL_CALL_MISSING_TOOL');
    expect(() => parseToolCall('{"tool":42,"arguments":{}}', TOOLS)).toThrow('TOOL_CALL_MISSING_TOOL');
    expect(() => parseToolCall('{"tool":"  ","arguments":{}}', TOOLS)).toThrow('TOOL_CALL_MISSING_TOOL');
  });

  it('rejects arguments that are not an object', () => {
    expect(() => parseToolCall('{"tool":"device.open_url","arguments":[1,2]}', TOOLS)).toThrow(
      'TOOL_CALL_ARGUMENTS_NOT_OBJECT',
    );
    expect(() => parseToolCall('{"tool":"device.open_url","arguments":"x"}', TOOLS)).toThrow(
      'TOOL_CALL_ARGUMENTS_NOT_OBJECT',
    );
  });

  it('does not execute anything by itself: it only returns a described call', () => {
    const call = parseToolCall('{"tool":"device.open_url","arguments":{"url":"https://a.test"}}', TOOLS);
    expect(Object.keys(call).sort()).toEqual(['arguments', 'tool']);
  });
});

describe('registry-derived grammar', () => {
  it('admits exactly the registered tools and nothing else', async () => {
    const { listToolNames, toolCallGrammar } = await import('@/lib/tools/registry');
    const names = listToolNames();
    const grammar = toolCallGrammar();

    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(grammar).toContain(`\\"${name}\\"`);
    }

    // The tool rule is a closed alternation over the registry, so its arm count
    // must equal the number of registered tools.
    const toolLine = grammar.split('\n').find((line) => line.startsWith('tool ::='));
    expect(toolLine?.split('|')).toHaveLength(names.length);
  });

  it('accepts a call to a real registered tool and rejects an unregistered one', async () => {
    const { listToolNames } = await import('@/lib/tools/registry');
    const names = listToolNames();
    const first = names[0]!;

    expect(parseToolCall(`{"tool":"${first}","arguments":{}}`, names).tool).toBe(first);
    expect(() => parseToolCall('{"tool":"shell.run","arguments":{"cmd":"rm -rf /"}}', names)).toThrow('UNKNOWN_TOOL');
  });
});
