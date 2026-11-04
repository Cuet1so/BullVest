import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const catalogSource = readFileSync('src/features/academy/v2/curriculum.ts', 'utf8');
const match = catalogSource.match(/export const ACADEMY_V2_CATALOG:[\s\S]*?= (\[[\s\S]*\]);\s*$/);
assert.ok(match, 'El catálogo V2 debe estar serializado como un array JSON en curriculum.ts');
const modules = JSON.parse(match[1]);

test('Academy V2 has five levels, thirteen modules, and fifty-seven unique lessons', () => {
  assert.equal(modules.length, 13);
  assert.deepEqual([...new Set(modules.map((module) => module.level))], [1, 2, 3, 4, 5]);
  assert.equal(modules.reduce((sum, module) => sum + module.lessons.length, 0), 57);
  assert.equal(new Set(modules.map((module) => module.slug)).size, 13);
  for (const module of modules) {
    assert.ok(module.lessons.length >= 4);
    assert.ok(module.title.length > 4);
    assert.equal(new Set(module.lessons.map((lesson) => lesson.slug)).size, module.lessons.length);
    for (const lesson of module.lessons) {
      assert.match(lesson.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  }
});

test('Academy V2 keeps completed work isolated from original Academy', () => {
  const migration = readFileSync('supabase/migrations/20261104131209_academy_v2.sql', 'utf8');
  for (const table of ['academy_modules', 'academy_lessons_v2', 'academy_exercises_v2', 'academy_user_progress_v2']) {
    assert.ok(migration.includes('create table public.' + table), 'Missing V2 table: ' + table);
  }
  assert.ok(migration.includes('security definer'));
  assert.ok(migration.includes('academy_private.exercise_keys_v2'));
  assert.ok(!/\bdrop\s+table\s+(?:public\.)?(?:academy_lessons|user_academy_progress)\b/i.test(migration));
});
