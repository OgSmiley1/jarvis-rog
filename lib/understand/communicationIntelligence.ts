export type UnderstandMode = 'analyse' | 'draft' | 'plan';

export interface StructuredUnderstanding {
  situation: string;
  objective: string;
  facts: string[];
  risks: string[];
  missingInformation: string[];
  questions: string[];
  actions: string[];
  draftReply: string;
}

const HEADERS = [
  'SITUATION',
  'OBJECTIVE',
  'FACTS',
  'RISKS',
  'MISSING INFORMATION',
  'QUESTIONS',
  'ACTIONS',
  'DRAFT REPLY',
] as const;

export function buildUnderstandPrompt(mode: UnderstandMode, text: string): string {
  const instruction =
    mode === 'draft'
      ? 'Prioritize a practical draft reply.'
      : mode === 'plan'
        ? 'Prioritize ordered next actions.'
        : 'Prioritize accurate analysis and uncertainty.';
  return `${instruction}\nReturn exactly these headings:\n${HEADERS.map((h) => `${h}:`).join('\n')}\n\nSOURCE TEXT:\n${text}`;
}

function section(raw: string, header: string, next?: string): string {
  const start = raw.indexOf(`${header}:`);
  if (start < 0) return '';
  const contentStart = start + header.length + 1;
  const end = next ? raw.indexOf(`${next}:`, contentStart) : raw.length;
  return raw.slice(contentStart, end < 0 ? raw.length : end).trim();
}

function lines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.replace(/^[-*\d.)\s]+/, '').trim())
    .filter(Boolean);
}

export function parseStructuredUnderstanding(raw: string): StructuredUnderstanding {
  for (const header of HEADERS) {
    if (!raw.includes(`${header}:`)) throw new Error(`MISSING_SECTION_${header.replace(/\s+/g, '_')}`);
  }
  return {
    situation: section(raw, 'SITUATION', 'OBJECTIVE'),
    objective: section(raw, 'OBJECTIVE', 'FACTS'),
    facts: lines(section(raw, 'FACTS', 'RISKS')),
    risks: lines(section(raw, 'RISKS', 'MISSING INFORMATION')),
    missingInformation: lines(section(raw, 'MISSING INFORMATION', 'QUESTIONS')),
    questions: lines(section(raw, 'QUESTIONS', 'ACTIONS')),
    actions: lines(section(raw, 'ACTIONS', 'DRAFT REPLY')),
    draftReply: section(raw, 'DRAFT REPLY'),
  };
}
