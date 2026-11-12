import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');

function bodyOf(name) {
  const match = html.match(new RegExp('function ' + name + '\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\}'));
  assert.ok(match, 'Function not found: ' + name);
  return match[1];
}

const pollBody = bodyOf('pollRejectedReports');
assert.match(pollBody, /currentUserRole\s*!==\s*['"]employee_knz['"]/, 'poll must be limited to KNZ employees');
assert.match(pollBody, /roleFeatureFlags\.employee_knz\s*!==\s*true/, 'poll must require an explicitly enabled KNZ feature');
assert.match(pollBody, /const userId=cloudUser\.id/, 'poll must capture the session owner');
assert.match(pollBody, /cloudUser\.id!==userId/, 'poll responses must be discarded after an account change');
assert.ok(pollBody.indexOf('await cloudClient.rpc') < pollBody.indexOf('cloudUser.id!==userId'), 'poll response must be checked after the RPC resolves');

const startBody = bodyOf('startRejectedReportPolling');
assert.match(startBody, /currentUserRole\s*!==\s*['"]employee_knz['"]/, 'poll timer must be role-gated');
assert.match(startBody, /roleFeatureFlags\.employee_knz\s*!==\s*true/, 'poll timer must require an explicitly enabled feature');

const accessBody = bodyOf('refreshKnzTaskPollingAccess');
assert.match(accessBody, /rpc\(['"]user_get_role_features['"]\)/, 'poll access must be verified from the server');
assert.match(accessBody, /data\?\.employee_knz\s*===\s*true/, 'polling must fail closed unless the server explicitly enables the feature');
assert.match(accessBody, /startRejectedReportPolling\(\)/, 'polling must start only after access is verified');

const roleBody = bodyOf('refreshCurrentUserRole');
assert.match(roleBody, /stopRejectedReportPolling\(\)/, 'role refresh must stop the previous session poll immediately');
assert.match(roleBody, /currentUserRole='employee'/, 'role refresh must clear the previous privileged role before awaiting the new role');
assert.match(roleBody, /roleFeatureFlags=\{\.\.\.roleFeatureFlags,employee_knz:false\}/, 'role refresh must clear the previous session feature grant');
assert.match(roleBody, /const userId=cloudUser\.id/, 'role refresh must capture the session owner');
assert.match(roleBody, /cloudUser\.id!==userId/, 'stale role responses must not cross account changes');
assert.match(roleBody, /currentUserRole='employee'/, 'role lookup errors must fall back to the least-privileged role');
assert.match(roleBody, /roleResolved&&currentUserRole==='employee_knz'/, 'KNZ polling must not start when role lookup fails');
assert.match(roleBody, /void\s+refreshKnzTaskPollingAccess\(\)/, 'role refresh must control KNZ polling');
assert.match(roleBody, /else\s+stopRejectedReportPolling\(\)/, 'non-KNZ or unresolved roles must stop KNZ polling');

const starts = [...html.matchAll(/startRejectedReportPolling\(\);/g)];
assert.equal(starts.length, 1, 'polling must not be started unconditionally during login');

console.log('KNZ rejected-task polling access checks passed.');
