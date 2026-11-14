import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('global-stories.js', 'utf8');
const urlMatch = source.match(/async function url\(r\)\{([\s\S]*?)\nasync function load/);
assert.ok(urlMatch, 'Global story URL helper must exist');
assert.match(urlMatch[1], /old\.path===r\.storage_path&&old\.until>Date\.now\(\)\+3e4/, 'a signed URL must be reused only for the same storage path while it remains valid');
assert.match(urlMatch[1], /signed\.set\(r\.id,\{path:r\.storage_path,url:data\.signedUrl,until:Date\.now\(\)\+ttl\*1000\}\)/, 'the cache must remember the storage path and signed URL expiry');

const loadMatch = source.match(/async function load\(\)\{([\s\S]*?)\nasync function strip/);
assert.ok(loadMatch, 'Global story loader must exist');
const dataQueryIndex = loadMatch[1].indexOf('const {data,error}=await cloudClient.from');
assert.notEqual(dataQueryIndex, -1, 'the successful story query must be present');
const featureDisabledPath = loadMatch[1].slice(0, dataQueryIndex);
assert.match(featureDisabledPath, /rows=\[\];signed\.clear\(\)/, 'disabling the feature must still clear cached URLs');
const successfulRefreshStart = loadMatch[1].indexOf('rows=Array.isArray(data)?data:[];');
const successfulRefreshEnd = loadMatch[1].indexOf('}catch(e)', successfulRefreshStart);
const successfulRefreshPath = loadMatch[1].slice(successfulRefreshStart, successfulRefreshEnd < 0 ? undefined : successfulRefreshEnd);
assert.doesNotMatch(successfulRefreshPath, /signed\.clear\(\)/, 'successful periodic refreshes must not discard all valid signed URLs');
assert.match(loadMatch[1], /const activeIds=new Set\(rows\.map\(r=>r\.id\)\)/, 'the cache must be reconciled against active stories');
assert.match(loadMatch[1], /for\(const id of signed\.keys\(\)\)if\(!activeIds\.has\(id\)\)signed\.delete\(id\)/, 'removed or expired stories must be evicted from the cache');

const featureGate = loadMatch[1].indexOf("if(feature.error||feature.data?.global_stories!==true)");
assert.ok(featureGate >= 0 && featureGate < dataQueryIndex, 'global stories must fail closed before querying story rows when the feature flag is unavailable or disabled');
assert.match(loadMatch[1], /rows=\[\];signed\.clear\(\)/, 'a failed or disabled feature check must clear stale rows and signed URLs');

const publishMatch = source.match(/async function publish\(e\)\{([\s\S]*?)\nasync function remove/);
assert.ok(publishMatch, 'Global story publisher must exist');
const publishGate = publishMatch[1].indexOf('if(feature.error||feature.data?.global_stories!==true)');
const uploadIndex = publishMatch[1].indexOf(".storage.from(BUCKET).upload");
assert.ok(publishGate >= 0 && uploadIndex > publishGate, 'publishing must fail closed before uploading when feature access cannot be verified');

console.log('Global story cache and fail-closed feature checks passed.');
