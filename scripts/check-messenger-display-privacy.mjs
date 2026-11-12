import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync('supabase/messenger-display-name-privacy.sql', 'utf8');
const employeeSql = readFileSync('supabase/employee-story-sharing-messenger.sql', 'utf8');
const messengerSql = readFileSync('supabase/messenger-always-enabled.sql', 'utf8');

function functionBlock(source, name) {
  const marker = 'create or replace function public.' + name.toLowerCase() + '(';
  const start = source.toLowerCase().indexOf(marker);
  assert.notEqual(start, -1, 'Missing function: ' + name);
  const tail = source.slice(start);
  const next = tail.slice(marker.length).search(/\ncreate or replace function public\./i);
  return next < 0 ? tail : tail.slice(0, marker.length + next + 1);
}

function assertSafeDisplayName(source, name, allowSelfEmail = false) {
  const block = functionBlock(source, name);
  const nameProperty = block.match(/'name'\s*,([\s\S]*?)(?=,\s*'[a-z_]+'\s*,)/i);
  assert.ok(nameProperty, name + ': name property is missing');
  assert.doesNotMatch(nameProperty[1], /(?:u|viewer)\.email/i, name + ': account email must not be used as a display-name fallback');
  assert.match(nameProperty[1], /'Сотрудник'/, name + ': safe generic fallback is missing');
  if (!allowSelfEmail) assert.doesNotMatch(block, /'email'\s*,/i, name + ': email must not be returned by this employee-facing list function');
  return block;
}

for (const source of [migration, employeeSql]) {
  const helper = assertSafeDisplayName(source, '_provoda_monthly_story_payload', true);
  assert.match(helper, /'email',\s*u\.email/i, 'private monthly-story helper must preserve the email field for the owner view');
  assertSafeDisplayName(source, 'user_list_shared_monthly_stories');
}
for (const source of [migration, employeeSql, messengerSql]) {
  assertSafeDisplayName(source, 'messenger_list_users');
  assertSafeDisplayName(source, 'messenger_list_conversations');
}
assert.match(migration, /begin;/i);
assert.match(migration, /commit;\s*$/i);
for (const name of ['_provoda_monthly_story_payload', 'user_list_shared_monthly_stories', 'messenger_list_users', 'messenger_list_conversations']) {
  assert.ok(functionBlock(migration, name).trimEnd().endsWith('$function$;'), name + ': SQL function terminator is missing');
}
assert.match(migration, /security definer/i);
assert.match(migration, /set search_path to ''/i);
console.log('Employee-facing display-name privacy checks passed.');
