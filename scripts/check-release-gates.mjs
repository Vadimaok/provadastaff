import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflows = [
  '.github/workflows/build-android.yml',
  '.github/workflows/build-windows.yml'
];

for (const file of workflows) {
  const source = readFileSync(file, 'utf8');
  assert.match(source, /workflow_dispatch:\s*\n\s+inputs:\s*\n\s+publish_release:/, \`\${file}: manual publish input is missing\`);
  assert.match(source, /publish_release:[\s\S]{0,240}default:\s*false/, \`\${file}: publish must default to false\`);
  assert.match(source, /^permissions:\s*\n\s+contents:\s+read/m, \`\${file}: workflow-wide token must be read-only\`);

  const releaseStart = source.indexOf('\n  release:');
  assert.notEqual(releaseStart, -1, \`\${file}: isolated release job is missing\`);
  const buildStart = source.indexOf('\n  build:');
  assert.notEqual(buildStart, -1, \`\${file}: build job is missing\`);
  const buildJob = source.slice(buildStart, releaseStart);
  const releaseJob = source.slice(releaseStart);

  assert.doesNotMatch(buildJob, /gh release (?:view|create|upload)/, \`\${file}: build job must not publish releases\`);
  assert.match(releaseJob, /if:\s*github\.event_name == 'workflow_dispatch' && inputs\.publish_release == true && github\.ref == 'refs\/heads\/main'/, \`\${file}: release job must require explicit manual approval on main\`);
  assert.match(releaseJob, /permissions:\s*\n\s+contents:\s+write/, \`\${file}: write permission must be limited to the release job\`);
  assert.match(releaseJob, /gh release (?:view|create|upload)/, \`\${file}: release commands are missing from the gated job\`);
}

console.log('Release gate checks passed for Android and Windows workflows.');
