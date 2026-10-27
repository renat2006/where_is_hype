import fs from 'node:fs';
import path from 'node:path';

import { type BrowserContext, expect, type Page, test } from '@playwright/test';

const SHOTS_DIR = path.resolve(import.meta.dirname, '../../../../../reports/P16-shots');
const MOCK_DB_STORAGE_KEY = 'where-is-hype:mock-db:v1';
const SESSION_STORAGE_KEY = 'where-is-hype:session';
const THEME_STORAGE_KEY = 'where-is-hype:theme';

const EXPECTED_12_EVENTS = [
  'link_pasted',
  'candidates_shown',
  'place_saved',
  'map_opened',
  'filter_applied',
  'card_opened',
  'route_clicked',
  'shortlist_shared',
  'friend_page_opened',
  'friend_voted',
  'visit_marked',
  'expectation_answered',
] as const;

interface StoredAnalyticsEvent {
  event: string;
  anonymousId: string;
  timestamp: string;
  props?: Record<string, unknown>;
}

interface StoredMockDb {
  events?: StoredAnalyticsEvent[];
  savedPlaces?: {
    place: { id: string; name: string };
    sourceUrl: string | null;
  }[];
}

async function setupDeterministicEnvironment(context: BrowserContext): Promise<void> {
  // Фиксируем московское время 15:00, чтобы в фильтре «На вечер» был доступен слот 19:00 и тема auto = day
  await context.clock.setFixedTime(new Date('2026-10-27T15:00:00+03:00'));

  // Изолируем тесты от внешних тайлов карты и редиректов в Яндекс Карты
  await context.route('https://tiles.openfreemap.org/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ version: 8, sources: {}, layers: [] }),
    });
  });

  await context.route('https://yandex.ru/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>Яндекс Карты (мок)</title>',
    });
  });
}

async function startSessionAndOpenMap(page: Page): Promise<void> {
  await page.goto('/welcome');
  await page.waitForFunction(
    (sessionKey) => Boolean(window.localStorage.getItem(sessionKey)),
    SESSION_STORAGE_KEY,
  );
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/);
}

async function readTrackedEvents(page: Page): Promise<StoredAnalyticsEvent[]> {
  return page.evaluate((storageKey) => {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as StoredMockDb;
    return parsed.events ?? [];
  }, MOCK_DB_STORAGE_KEY);
}

async function saveDayAndNightScreenshots(page: Page, baseName: string): Promise<void> {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });

  await page.evaluate(async (themeKey) => {
    window.localStorage.setItem(themeKey, 'day');
    document.documentElement.dataset.theme = 'day';
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
  }, THEME_STORAGE_KEY);
  await page.screenshot({
    path: path.join(SHOTS_DIR, `${baseName}-day.png`),
    fullPage: false,
    animations: 'disabled',
  });

  await page.evaluate(async (themeKey) => {
    window.localStorage.setItem(themeKey, 'night');
    document.documentElement.dataset.theme = 'night';
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
  }, THEME_STORAGE_KEY);
  await page.screenshot({
    path: path.join(SHOTS_DIR, `${baseName}-night.png`),
    fullPage: false,
    animations: 'disabled',
  });

  await page.evaluate(async (themeKey) => {
    window.localStorage.setItem(themeKey, 'day');
    document.documentElement.dataset.theme = 'day';
    await new Promise((resolve) => window.requestAnimationFrame(resolve));
  }, THEME_STORAGE_KEY);
}

test.describe('US10: Ключевой сценарий КТ-3, развилки и проверка 12 событий воронки', () => {
  test.beforeEach(async ({ context }) => {
    await setupDeterministicEnvironment(context);
  });

  test('Основной путь демо (КТ-3) + проверка всех 12 событий воронки без ПДн + скриншоты день/ночь', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    // 1. Знакомство (360×780, без регистрации и ПДн)
    await page.goto('/');
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(
      page.getByRole('heading', { name: 'Увидел в рилсах — сходи вживую' }),
    ).toBeVisible();
    await expect(page.getByText('Без регистрации. Имя и телефон не нужны.')).toBeVisible();
    await expect(page.locator('input[type="email"], input[type="tel"]')).toHaveCount(0);
    await saveDayAndNightScreenshots(page, '01-welcome');

    // 2. Вставить ссылку «Пример: кофейня» → до 3 кандидатов с адресом и метро
    await page.getByRole('button', { name: 'Пример: кофейня' }).click();
    await expect(page).toHaveURL(/\/add\?url=/);
    await expect(page.getByRole('heading', { name: 'Это оно?' })).toBeVisible({
      timeout: 15_000,
    });

    const primaryCandidate = page.locator(
      '[data-candidate-id="zhuk-i-pchela"][data-candidate-state="primary"]',
    );
    await expect(primaryCandidate).toBeVisible();
    await expect(primaryCandidate).toContainText('Жук и Пчела');
    await expect(primaryCandidate).toContainText('ул. Мясницкая, 24');
    await expect(primaryCandidate).toContainText('м. Чистые пруды');

    await expect(
      page.locator('[data-candidate-id="pokrovka-coffee"][data-candidate-state="secondary"]'),
    ).toContainText('Кофейня во дворе');
    await expect(
      page.locator('[data-candidate-id="zerno"][data-candidate-state="secondary"]'),
    ).toContainText('Зерно');
    await saveDayAndNightScreenshots(page, '02-candidates');

    // 3. «Да, сохранить» → карточка сохранённого места
    await page.getByRole('button', { name: 'Да, сохранить' }).click();
    await expect(page).toHaveURL(/\/place\/zhuk-i-pchela$/);
    await expect(page.getByTestId('place-title')).toHaveText('Жук и Пчела');

    // 4. Переход к карте и списку → «Демо: добавить 8 мест» → карта и список по расстоянию
    await page.getByRole('link', { name: 'Места' }).click();
    await expect(page).toHaveURL(/\/$/);

    const seedButton = page.getByRole('button', { name: 'Демо: добавить 8 мест' });
    await expect(seedButton).toBeVisible();
    await seedButton.click();

    const placeRows = page.locator('[data-place-id]');
    await expect(placeRows).toHaveCount(9, { timeout: 10_000 });
    await expect(page.getByTestId('places-map')).toBeVisible();

    // Проверяем сортировку списка по неубыванию расстояния
    const distanceLocators = page.getByTestId('place-row-distance');
    const distancesText = await distanceLocators.allInnerTexts();
    const parsedMeters = distancesText.map((raw) => {
      const kmMatch = /(\d+(?:[.,]\d+)?)\s*км/.exec(raw);
      if (kmMatch?.[1]) {
        return Math.round(Number(kmMatch[1].replace(',', '.')) * 1000);
      }
      const mMatch = /(\d+)\s*м\b/.exec(raw);
      if (mMatch?.[1]) {
        return Number(mMatch[1]);
      }
      return 0;
    });
    for (let i = 1; i < parsedMeters.length; i += 1) {
      expect(parsedMeters[i]).toBeGreaterThanOrEqual(parsedMeters[i - 1] ?? 0);
    }
    await saveDayAndNightScreenshots(page, '03-map-and-list');

    // 5. Фильтр «19:00, до 1 500 ₽» даёт 3–5 мест, среди них «Часы не уточнены»
    await page.getByTestId('evening-filter-trigger').click();
    await expect(page.getByTestId('evening-filter-sheet')).toBeVisible();
    await page.getByRole('button', { name: '19:00' }).click();
    await page.getByRole('button', { name: /до 1500 ₽/i }).click();
    await saveDayAndNightScreenshots(page, '04-evening-filter');

    const submitFilterBtn = page.getByTestId('evening-filter-submit');
    await expect(submitFilterBtn).toHaveText('Показать 5 из 9');
    await submitFilterBtn.click();

    const filteredCount = await placeRows.count();
    expect(filteredCount).toBeGreaterThanOrEqual(3);
    expect(filteredCount).toBeLessThanOrEqual(5);
    await expect(page.locator('[data-place-id="zhuravli"]')).toContainText('Часы не уточнены');

    // 6. Карточка → назад, фильтр сохранён
    await page.locator('[data-place-id="zhuravli"]').click();
    await expect(page).toHaveURL(/\/place\/zhuravli$/);
    await expect(page.getByTestId('place-title')).toHaveText('Журавли');
    await saveDayAndNightScreenshots(page, '05-place-card');

    await page.getByRole('button', { name: 'Назад' }).click();
    await expect(page).toHaveURL(/\/\?at=19&maxCheck=1500$/);
    await expect(page.getByTestId('evening-filter-trigger')).toHaveText('Фильтр · 5');
    await expect(placeRows).toHaveCount(5);

    // 7. 2 места в «На вечер» → «Отправить» → «Открыть как друг» → «Мне подходит» → автор видит голос
    await page.getByTestId('shortlist-row-toggle-zhuravli').click();
    await page.getByTestId('shortlist-row-toggle-pokrovka-coffee').click();

    await page.getByRole('link', { name: /На вечер/ }).click();
    await expect(page).toHaveURL(/\/evening$/);
    await expect(page.getByTestId('evening-place-row-zhuravli')).toBeVisible();
    await expect(page.getByTestId('evening-place-row-pokrovka-coffee')).toBeVisible();

    await page.getByTestId('evening-share-button').click();
    await expect(page.getByTestId('evening-open-as-friend')).toBeVisible();

    const friendPopupPromise = page.waitForEvent('popup');
    await page.getByTestId('evening-open-as-friend').click();
    const friendPage = await friendPopupPromise;

    await expect(friendPage).toHaveURL(/\/s\/evening-demo$/);
    await expect(friendPage.getByRole('heading', { name: 'Куда в пятницу?' })).toBeVisible();

    const voteZhuravliBtn = friendPage.getByTestId('vote-button-zhuravli');
    await expect(voteZhuravliBtn).toContainText('Мне подходит');
    await voteZhuravliBtn.click();
    await expect(voteZhuravliBtn).toContainText('Подходит');
    await expect(friendPage.getByTestId('friend-voters-summary')).toContainText('уже ответил 1');
    await saveDayAndNightScreenshots(friendPage, '06-friend-shortlist');
    await friendPage.close();

    // Автор видит голос друга после возврата фокуса
    await page.bringToFront();
    await page.evaluate(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await expect(page.getByTestId('evening-subtitle')).toContainText('Ответил 1 друг');
    await expect(page.getByTestId('shortlist-leader')).toContainText('Лидирует Журавли — 1 из 1.');
    await expect(page.getByTestId('evening-place-votes-zhuravli')).toHaveText('1');
    await saveDayAndNightScreenshots(page, '07-author-shortlist-voted');

    // 8. Переход в карточку лидера → «Маршрут» → «Я здесь» → «Визит отмечен» → «Совпало с ожиданиями?»
    await page.getByTestId('evening-place-row-zhuravli').getByRole('link').click();
    await expect(page).toHaveURL(/\/place\/zhuravli$/);

    const routePopupPromise = page.waitForEvent('popup');
    await page.getByTestId('place-route-button').click();
    const routePopup = await routePopupPromise;
    await routePopup.close();

    await page.getByTestId('mark-visit-button').click();
    await expect(page.getByTestId('mark-visit-modal')).toBeVisible();
    await expect(page.getByTestId('mark-visit-title')).toHaveText('Визит отмечен');
    await expect(page.getByTestId('mark-visit-verification')).toContainText(
      'подтверждён · рядом, до 200 м',
    );
    await expect(page.getByText('Совпало с ожиданиями?')).toBeVisible();
    await saveDayAndNightScreenshots(page, '08-visit-marked');

    await page.getByTestId('expectation-chip-better').click();
    await page.getByTestId('mark-visit-submit').click();
    await expect(page.getByTestId('mark-visit-modal')).toBeHidden();

    // 9. Проверка US10: все 12 событий воронки отправлены с анонимным id и без персональных данных
    await expect
      .poll(async () => {
        const currentEvents = await readTrackedEvents(page);
        const names = new Set(currentEvents.map((e) => e.event));
        return EXPECTED_12_EVENTS.every((name) => names.has(name));
      })
      .toBe(true);

    const events = await readTrackedEvents(page);
    const recordedNames = new Set(events.map((item) => item.event));

    for (const expectedEvent of EXPECTED_12_EVENTS) {
      expect(recordedNames.has(expectedEvent), `Ожидалось событие воронки ${expectedEvent}`).toBe(
        true,
      );
    }

    const forbiddenKeys = new Set(['name', 'phone', 'email', 'firstName', 'lastName', 'username']);
    for (const item of events) {
      expect(typeof item.anonymousId).toBe('string');
      expect(item.anonymousId.length).toBeGreaterThan(0);
      expect(Number.isNaN(Date.parse(item.timestamp))).toBe(false);

      if (item.props) {
        for (const key of Object.keys(item.props)) {
          expect(forbiddenKeys.has(key), `Запрещённое ПДн-поле ${key} в ${item.event}`).toBe(false);
        }
      }
    }

    // Проверяем ключевые свойства атрибуции в событиях
    const placeSavedEvent = events.find((item) => item.event === 'place_saved');
    expect(placeSavedEvent?.props?.source).toBe('link');

    const visitMarkedEvent = events.find((item) => item.event === 'visit_marked');
    expect(visitMarkedEvent?.props?.verified).toBe(true);
    expect(visitMarkedEvent?.props?.status).toBe('verified');

    const expectationEvent = events.find((item) => item.event === 'expectation_answered');
    expect(expectationEvent?.props?.expectation).toBe('better');
  });

  test('Развилка 1: ссылка не распознана → «Не узнали место» → поиск по названию → «Да, сохранить»', async ({
    page,
  }) => {
    await page.goto('/welcome');
    await page.getByRole('button', { name: 'Пример: не распознаётся' }).click();

    await expect(page).toHaveURL(/\/add\?url=/);
    await expect(page.getByText('Не узнали место')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByLabel('Ссылка на ролик')).toHaveValue(
      /instagram\.com\/reel\/unknown-place/,
    );

    await page.getByLabel('Название места').fill('Сосны');
    const confirmSaveByNameBtn = page.getByRole('button', { name: 'Да, сохранить' });
    await expect(confirmSaveByNameBtn).toBeVisible();
    await saveDayAndNightScreenshots(page, '09-unrecognized-search');

    await confirmSaveByNameBtn.click();
    await expect(page).toHaveURL(/\/place\/sosny$/);
    await expect(page.getByTestId('place-title')).toHaveText('Сосны');

    // Проверяем, что в аналитике зафиксирован source: 'name'
    await expect
      .poll(async () => {
        const events = await readTrackedEvents(page);
        return events.some((item) => item.event === 'place_saved' && item.props?.source === 'name');
      })
      .toBe(true);
  });

  test('Развилка 2: повторная ссылка → «Уже в твоих местах» без дубликата', async ({ page }) => {
    await page.goto('/welcome');
    await page.getByRole('button', { name: 'Пример: кофейня' }).click();
    const saveBtn = page.getByRole('button', { name: 'Да, сохранить' });
    await expect(saveBtn).toBeVisible({ timeout: 15_000 });
    await saveBtn.click();
    await expect(page).toHaveURL(/\/place\/zhuk-i-pchela$/);

    // Повторно отправляем ту же ссылку
    await page.goto('/add');
    await page.getByRole('button', { name: 'Пример: кофейня' }).click();

    const savedCard = page.locator(
      '[data-candidate-id="zhuk-i-pchela"][data-candidate-state="saved"]',
    );
    await expect(savedCard).toContainText('Уже в твоих местах', {
      timeout: 15_000,
    });
    await expect(savedCard.getByRole('button', { name: 'Открыть' })).toBeVisible();

    const savedCount = await page.evaluate((storageKey) => {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return 0;
      const parsed = JSON.parse(raw) as StoredMockDb;
      return parsed.savedPlaces?.length ?? 0;
    }, MOCK_DB_STORAGE_KEY);
    expect(savedCount).toBe(1);
  });

  test('Развилка 3: пустая карта → «Кинь ссылку» ведёт на добавление', async ({ page }) => {
    await startSessionAndOpenMap(page);

    await expect(page.getByRole('heading', { name: 'Пока пусто' })).toBeVisible();

    const dropLinkBtn = page.getByRole('button', { name: 'Кинь ссылку' });
    await expect(dropLinkBtn).toBeVisible();
    await dropLinkBtn.click();
    await expect(page).toHaveURL(/\/add$/);
  });

  test('Развилка 4: фильтр без результатов → «Ничего не подошло» → «Сбросить фильтры»', async ({
    page,
  }) => {
    await startSessionAndOpenMap(page);

    await page.getByRole('button', { name: 'Демо: добавить 8 мест' }).click();
    const placeRows = page.locator('[data-place-id]');
    await expect(placeRows).toHaveCount(8, { timeout: 10_000 });

    await page.getByTestId('evening-filter-trigger').click();
    await page.getByRole('button', { name: '23:00' }).click();
    await page.getByRole('button', { name: 'Бар' }).click();
    await page.getByRole('button', { name: /до 1000 ₽/i }).click();
    await page.getByRole('switch', { name: /Рядом с метро/i }).click();
    await page.getByTestId('evening-filter-submit').click();

    await expect(page.getByRole('heading', { name: 'Ничего не подошло' })).toBeVisible();
    const resetBtn = page.getByRole('button', { name: 'Сбросить фильтры' });
    await expect(resetBtn).toBeVisible();
    await resetBtn.click();

    await expect(placeRows).toHaveCount(8);
  });

  test('Развилка 5: друг не ответил → «Маршрут» доступен автору без ожидания голосов', async ({
    page,
  }) => {
    await startSessionAndOpenMap(page);
    await page.getByRole('button', { name: 'Демо: добавить 8 мест' }).click();
    await expect(page.locator('[data-place-id]')).toHaveCount(8, { timeout: 10_000 });

    await page.getByTestId('shortlist-row-toggle-zhuravli').click();
    await page.getByTestId('shortlist-row-toggle-sosny').click();

    await page.getByRole('link', { name: /На вечер/ }).click();
    await expect(page).toHaveURL(/\/evening$/);
    await page.getByTestId('evening-share-button').click();
    await expect(page.getByTestId('evening-subtitle')).toContainText(
      '2 места · можно от 2 до 5 · ссылка живёт 7 дней',
    );

    // Открываем карточку места без голосов друга — кнопка «Маршрут» активна
    await page.getByTestId('evening-place-row-zhuravli').getByRole('link').click();
    await expect(page).toHaveURL(/\/place\/zhuravli$/);

    const routeBtn = page.getByTestId('place-route-button');
    await expect(routeBtn).toBeVisible();
    await expect(routeBtn).toBeEnabled();

    const popupPromise = page.waitForEvent('popup');
    await routeBtn.click();
    const popup = await popupPromise;
    await popup.close();
  });

  test('Развилка 6: «Демо: я далеко» → визит отмечен «без проверки»', async ({ page }) => {
    await page.goto('/welcome');
    await page.getByRole('button', { name: 'Пример: кофейня' }).click();
    const saveBtn = page.getByRole('button', { name: 'Да, сохранить' });
    await expect(saveBtn).toBeVisible({ timeout: 15_000 });
    await saveBtn.click();
    await expect(page).toHaveURL(/\/place\/zhuk-i-pchela$/);

    await page.getByTestId('mark-visit-button').click();
    await expect(page.getByTestId('mark-visit-modal')).toBeVisible();
    await expect(page.getByTestId('mark-visit-verification')).toContainText(
      'подтверждён · рядом, до 200 м',
    );

    // Переключаем демо-тумблер «Демо: я рядом / я далеко» в режим «я далеко»
    await page.getByTestId('mark-visit-demo-toggle').click();
    await expect(page.getByTestId('mark-visit-verification')).toContainText(
      'без проверки · ты дальше 200 м',
    );

    await expect
      .poll(async () => {
        const events = await readTrackedEvents(page);
        return events.some(
          (item) =>
            item.event === 'visit_marked' &&
            item.props?.verified === false &&
            item.props.status === 'not',
        );
      })
      .toBe(true);
  });
});
