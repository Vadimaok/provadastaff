import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const client = readFileSync('provoda-user-stories.js', 'utf8');
const migration = readFileSync('supabase/messenger-user-stories.sql', 'utf8');
const html = readFileSync('index.html', 'utf8');
const android = readFileSync('.github/workflows/build-android.yml', 'utf8');

assert.match(html, /provoda-user-stories\.js/, 'employee stories module must be loaded');
assert.match(android, /provoda-user-stories\.js/, 'employee stories module must be included in Android bundle');
assert.match(client, /createSignedUrl\(/, 'private media must be served through signed URLs');
assert.match(client, /storage\.from\(BUCKET\)\.upload\(/, 'stories must upload through the private bucket');
assert.match(client, /expires_at/, 'stories must have an expiry');
assert.match(migration, /public = false/, 'stories bucket must remain private');
assert.match(migration, /enable row level security/i, 'stories table must have RLS enabled');
assert.match(migration, /messenger_user_stories_insert_own/, 'only own stories may be inserted');
assert.match(migration, /messenger_user_stories_storage_insert_own/, 'storage uploads must be scoped to the authenticated user');
assert.match(migration, /messenger_user_stories_storage_read_active/, 'storage reads must require an active story row');
assert.doesNotMatch(client, /getPublicUrl\(/, 'private stories must not use public URLs');

console.log('Employee stories security and integration checks passed.');
