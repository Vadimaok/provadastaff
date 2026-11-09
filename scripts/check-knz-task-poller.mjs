import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');

function bodyOf(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(new RegExp('(?:async\\s+)?function\\s+' + escaped + '\\s*\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\}'));
  assert.ok(match, 'Function not found: ' + name);
  return match[1];
}

const pollBody = bodyOf('pollRejectedReports');
assert.match(pollBody, /currentUserRole\\s*!==\\s*['"]employee_knz['"]/, 'poll must be limited to KNZ employees');
assert.match(pollBody, /roleFeatureFlags\\.employee_knz\\s*===\\s*false/, 'poll must stop when the KNZ feature is disabled');

const startBody = bodyOf('startRejectedReportPolling');
assert.match(startBody, /currentUserRole\\s*!==\\s*['"]employee_knz['"]/, 'poll timer must be role-gated');
assert.match(startBody, /roleFeatureFlags\\.employee_knz\\s*===\\s*false/, 'poll timer must respect the feature toggle');

const accessBody = bodyOf('refreshKnzTaskPollingAccess');
assert.match(accessBody, /rpc\\(['"]user_get_role_features['"]\\)/, 'poll access must be verified from the server');
assert.match(accessBody, /data\\?\\.employee_knz\\s*!==\\s*false/, 'server feature state must be applied');
assert.match(accessBody, /startRejectedReportPolling\\(\\)/, 'polling must start only after access is verified');

const roleBody = bodyOf('refreshCurrentUserRole');
assert.match(roleBody, /void\\s+refreshKnzTaskPollingAccess\\(\\)/, 'role refresh must control KNZ polling');
assert.match(roleBody, /else\\s+stopRejectedReportPolling\\(\\)/, 'non-KNZ roles must stop KNZ polling');

const starts = [...html.matchAll(/startRejectedReportPolling\\(\\);/g)];
assert.equal(starts.length, 1, 'polling must not be started unconditionally during login');

console.log('KNZ rejected-task polling access checks passed.');
