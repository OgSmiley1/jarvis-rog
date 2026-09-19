import fs from 'node:fs';
import path from 'node:path';

const reportPath = path.join(process.cwd(), 'docs', 'ACCEPTANCE_REPORT.md');
if (!fs.existsSync(reportPath)) {
  console.error('docs/ACCEPTANCE_REPORT.md is missing');
  process.exit(1);
}
const report = fs.readFileSync(reportPath, 'utf8');
const required = ['TypeScript:', 'Unit tests:', 'Gradle debug:', 'GGUF import:', 'Offline inference:', 'Voice:'];
const missing = required.filter((item) => !report.includes(item));
if (missing.length) {
  console.error(`Acceptance report is missing: ${missing.join(', ')}`);
  process.exit(1);
}
console.log('Acceptance report structure is present. Hardware items must still be filled with real results.');
