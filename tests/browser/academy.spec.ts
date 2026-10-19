import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

interface SeedLesson {
  level: number; order: number; title: string; content: unknown;
  questions: { prompt: string; options: string[] }[]; answers: number[];
}
const migration = readFileSync('supabase/migrations/20261015141442_academy_curriculum_and_progress.sql', 'utf8');
const seed: SeedLesson[] = JSON.parse(migration.split('$curriculum$')[1]);
const lessons = seed.map((item, index) => ({ ...item, id: `lesson-${index + 1}`, level_id: `level-${item.level}`, order_index: item.order }));
const titles = ['Análisis de Estados Financieros', 'Screening Cuantitativo', 'Análisis Cualitativo y Moats', 'Análisis Técnico y Tendencias', 'Timing de Mercado y Gestión de Riesgo'];
const userId = '00000000-0000-4000-8000-000000000001';
const user = { id: userId, aud: 'authenticated', role: 'authenticated', email: 'academy@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };

async function mockAcademy(page: Page, options: { pro?: boolean; fail?: boolean; failCompletion?: boolean } = {}) {
  const control = { fail: options.fail ?? false, failCompletion: options.failCompletion ?? false };
  const progress = new Map<string, { lesson_id: string; score: number; completed: boolean; completed_at: string | null }>();
  const contentRequests: string[] = [];
  const browserErrors: string[] = [];

  page.on('pageerror', (error) => browserErrors.push(error.message));
  await page.addInitScript((sessionUser) => {
    localStorage.setItem('sb-zgycwhxwpxbqtivgssml-auth-token', JSON.stringify({
      access_token: 'academy-test-token', refresh_token: 'academy-test-refresh',
      expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'bearer', user: sessionUser,
    }));
  }, user);
  await page.route('https://*.supabase.co/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const send = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    const visible = lessons.filter((lesson) => options.pro || lesson.level === 1);
    if (url.pathname === '/auth/v1/user') return send(user);
    if (url.pathname === '/rest/v1/price_alerts') return send([]);
    if (url.pathname === '/rest/v1/rpc/get_portfolio_performance') return send([]);
    if (url.pathname === '/rest/v1/rpc/get_trading_statistics') return send([{ sell_count: 0, winning_sells: 0, win_rate_pct: null }]);
    if (url.pathname === '/rest/v1/profiles') return send({ id: userId, display_name: 'Ana', role: options.pro ? 'pro' : 'free', fictional_balance: 10000, lives_remaining: 3 });
    if (url.pathname === '/rest/v1/academy_levels') {
      if (control.fail) return send({ message: 'Unavailable', code: 'TEST_ERROR' }, 500);
      return send(titles.map((title, index) => ({ id: `level-${index + 1}`, title, level_number: index + 1 })).filter((level) => options.pro || level.level_number === 1));
    }
    if (url.pathname === '/rest/v1/lessons') {
      if (url.searchParams.get('select') === 'content_json') {
        const lessonId = url.searchParams.get('id')?.replace('eq.', '');
        const lesson = visible.find((item) => item.id === lessonId);
        expect(lesson).toBeDefined();
        contentRequests.push(lessonId!);
        return send({ content_json: lesson!.content });
      }
      return send(visible.map(({ id, level_id, title, order_index }) => ({ id, level_id, title, order_index })));
    }
    if (url.pathname === '/rest/v1/quizzes') {
      const lesson = visible.find((item) => `eq.${item.id}` === url.searchParams.get('lesson_id'));
      expect(lesson).toBeDefined();
      return send({ lesson_id: lesson!.id, questions: lesson!.questions, passing_score: 70 });
    }
    if (url.pathname === '/rest/v1/user_academy_progress') {
      expect(url.searchParams.get('user_id')).toBe(`eq.${userId}`);
      return send([...progress.values()].map((item) => ({ ...item, id: `progress-${item.lesson_id}`, user_id: userId, updated_at: new Date().toISOString() })));
    }
    if (url.pathname === '/rest/v1/rpc/submit_academy_quiz') {
      const body = request.postDataJSON() as { p_lesson_id: string; p_answers: number[] };
      const lesson = visible.find((item) => item.id === body.p_lesson_id)!;
      const correct = body.p_answers.filter((answer, index) => answer === lesson.answers[index]).length;
      const score = Math.round(correct / lesson.questions.length * 100);
      const previous = progress.get(lesson.id);
      progress.set(lesson.id, { lesson_id: lesson.id, score: Math.max(previous?.score ?? 0, score), completed: previous?.completed ?? false, completed_at: previous?.completed_at ?? null });
      return send([{ score, passed: score >= 70, correct_count: correct, question_count: lesson.questions.length }]);
    }
    if (url.pathname === '/rest/v1/rpc/complete_academy_lesson') {
      const body = request.postDataJSON() as { p_lesson_id: string };
      expect(Object.keys(body)).toEqual(['p_lesson_id']);
      if (control.failCompletion) return send({ message: 'Unavailable', code: 'TEST_ERROR' }, 500);
      const result = progress.get(body.p_lesson_id)!;
      expect(result.score).toBeGreaterThanOrEqual(70);
      result.completed = true;
      result.completed_at ??= new Date().toISOString();
      return send([{ ...result, user_id: userId, id: `progress-${result.lesson_id}`, updated_at: new Date().toISOString() }]);
    }
    if (url.pathname === '/functions/v1/create-checkout-session') return send({ code: 'BILLING_NOT_CONFIGURED' }, 503);
    throw new Error(`Unexpected Supabase request: ${request.method()} ${url.pathname}`);
  });
  return { control, browserErrors, contentRequests, progress };
}

test('Free roadmap shows five levels, protects Pro content and offers Stripe checkout with recoverable errors', async ({ page }) => {
  const { contentRequests, browserErrors } = await mockAcademy(page);
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.goto('/academia');
  await expect(page.getByRole('article')).toHaveCount(5);
  await expect(page.getByText('0/15 lecciones completadas')).toBeVisible();
  await expect(page.getByText('Bloqueado', { exact: true })).toHaveCount(4);
  await page.screenshot({ path: 'test-results/academy-desktop.png', fullPage: true });
  const trigger = page.getByRole('button', { name: 'Desbloquear con Pro' }).first();
  await trigger.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Pasar a Pro', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Los pagos aún no están configurados');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(contentRequests).toEqual([]);
  expect(browserErrors).toEqual([]);
});

test('lesson navigation, failed quiz, retry, completion retry and persistent progress', async ({ page }) => {
  const { control, progress, browserErrors } = await mockAcademy(page, { failCompletion: true });
  await page.goto('/academia');
  await page.getByRole('button', { name: 'Empezar nivel' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('La ecuación contable', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Siguiente lección' }).click();
  await expect(dialog.getByRole('heading', { name: seed[1].title, exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Anterior', exact: true }).click();
  await dialog.getByRole('button', { name: 'Iniciar test' }).click();
  await expect(dialog.getByRole('button', { name: 'Corregir test' })).toBeDisabled();
  for (let i = 0; i < 3; i++) await dialog.getByRole('group').nth(i).getByRole('radio').nth((seed[0].answers[i] + 1) % 3).check();
  await dialog.getByRole('button', { name: 'Corregir test' }).click();
  await expect(dialog.getByRole('status')).toContainText('Todavía no has aprobado · 0 %');
  expect(progress.get('lesson-1')?.completed).toBe(false);
  await dialog.getByRole('button', { name: 'Reintentar test' }).click();
  for (let i = 0; i < 3; i++) await dialog.getByRole('group').nth(i).getByRole('radio').nth(seed[0].answers[i]).check();
  await dialog.getByRole('button', { name: 'Corregir test' }).click();
  await expect(dialog.getByRole('status')).toContainText('Aprobado · 100 %');
  await expect(dialog.getByRole('alert')).toBeVisible();
  control.failCompletion = false;
  await dialog.getByRole('button', { name: 'Guardar progreso' }).click();
  await expect(dialog.getByRole('status')).toContainText('Tu progreso está guardado');
  await page.keyboard.press('Escape');
  await expect(page.getByText('1/15 lecciones completadas')).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Progreso global' })).toHaveAttribute('aria-valuenow', '7');
  await page.reload();
  await expect(page.getByText('1/15 lecciones completadas')).toBeVisible();
  await expect(page.getByText('En curso', { exact: true })).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test('Pro can read level five on mobile with no horizontal overflow', async ({ page }) => {
  const { browserErrors } = await mockAcademy(page, { pro: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/academia');
  await expect(page.getByRole('article')).toHaveCount(5);
  await expect(page.getByText('Bloqueado', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/academy-mobile.png', fullPage: true });
  await page.getByRole('article', { name: titles[4] }).getByRole('button', { name: 'Empezar nivel' }).click();
  await expect(page.getByRole('dialog').getByText('Ejemplo práctico', { exact: true })).toBeVisible();
  expect(await page.getByRole('dialog').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/academy-lesson-mobile.png' });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(browserErrors).toEqual([]);
});

test('catalog load errors can be retried', async ({ page }) => {
  const { control, browserErrors } = await mockAcademy(page, { fail: true });
  await page.goto('/academia');
  await expect(page.getByRole('alert')).toContainText('No se pudo cargar la ruta');
  control.fail = false;
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(5);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(browserErrors).toEqual([]);
});
