import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('global-stories.js', 'utf8');
const urlMatch = source.match(/async function url\(r\)\{([\s\S]*?)\nasync function load/);
assert.ok(urlMatch, 'Global story URL helper must exist');
assert.match(urlMatch[1], /old\.path===r\.storage_path&&old\.until>Date\.now\(\)\+3e4/, 'a signed URL must be reused only for the same storage path while it remains valid');
assert.match(urlMatch[1], /signed\.set\(r\.id,\{path:r\.storage_path,url:data\.signedUrl,until:Date\.now\(\)\+ttl\*1000\}\)/, 'the cache must remember the storage path and signed URL expiry');

const loadMatch = source.match(/async function load\(\)\{([\s\S]*?)\nasync function strip/);
assert.ok(loadMatch, 'Global story loader must exist');
assert.doesNotMatch(loadMatch[1], /signed\.clear\(\)/, 'successful periodic refreshes must not discard all valid signed URLs');
assert.match(loadMatch[1], /const activeIds=new Set\(rows\.map\(r=>r\.id\)\)/, 'the cache must be reconciled against active stories');
assert.match(loadMatch[1], /for\(const id of signed\.keys\(\)\)if\(!activeIds\.has\(id\)\)signed\.delete\(id\)/, 'removed or expired stories must be evicted from the cache');

console.log('Global story signed URL cache checks passed.');
