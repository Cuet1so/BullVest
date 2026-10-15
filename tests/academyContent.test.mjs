import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { ACADEMY_CATALOG, parseLessonContent, parseQuizQuestions } from '../src/features/academy/utils/academyContent.ts';

const migration = readFileSync(new URL('../supabase/migrations/20261015141442_academy_curriculum_and_progress.sql', import.meta.url), 'utf8');
const curriculum = JSON.parse(migration.split('$curriculum$')[1]);

test('all 15 seed lessons and 45 quiz questions satisfy the frontend contract', () => {
  assert.equal(curriculum.length, 15);
  for (const level of ACADEMY_CATALOG) {
    assert.deepEqual(curriculum.filter((lesson) => lesson.level === level.number).map((lesson) => lesson.order), [1, 2, 3]);
  }
  for (const lesson of curriculum) {
    assert.ok(parseLessonContent(lesson.content).sections.length >= 2);
    const questions = parseQuizQuestions(lesson.questions);
    assert.equal(questions.length, 3);
    assert.equal(lesson.answers.length, questions.length);
    questions.forEach((question, index) => {
      assert.ok(Number.isInteger(lesson.answers[index]));
      assert.ok(lesson.answers[index] >= 0 && lesson.answers[index] < question.options.length);
      assert.deepEqual(Object.keys(question).sort(), ['options', 'prompt']);
    });
  }
});

test('malformed content and unsafe source URLs produce controlled failures', () => {
  for (const value of [null, [], {}, { ...curriculum[0].content, sections: [] },
    { ...curriculum[0].content, source: { title: 'unsafe', url: 'javascript:alert(1)' } }]) {
    assert.throws(() => parseLessonContent(value));
  }
  for (const value of [null, [], [{ prompt: 'Question', options: ['Only one'] }],
    [{ prompt: 'Question', options: ['Valid', 2] }], [{ prompt: '', options: ['A', 'B'] }]]) {
    assert.throws(() => parseQuizQuestions(value));
  }
});
