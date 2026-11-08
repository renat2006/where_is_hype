import fs from 'node:fs';
import path from 'node:path';

import { type BrowserContext, expect, type Page, test } from '@playwright/test';

function resolveShotsDir(): string {
  const worktreeFarmRoot = path.resolve(import.meta.dirname, '../../../../..');
  if (path.basename(worktreeFarmRoot) === '.farm') {
    return path.resolve(worktreeFarmRoot, 'reports/K4-P1-shots');
  }
  return path.resolve(import.meta.dirname, '../../../.farm/reports/K4-P1-shots');
}

const SHOTS_DIR = resolveShotsDir();
const MOCK_DB_STORAGE_KEY = 'where-is-hype:mock-db:v1';
const SESSION_STORAGE_KEY = 'where-is-hype:session';
const THEME_STORAGE_KEY = 'where-is-hype:theme';

interface StoredMockDb {
  reports?: { id: string; query: string; sourceUrl: string | null }[];
  savedPlaces?: {
    place: { id: string; name: string };
    sourceUrl: string | null;
    note: string;
  }[];
  events?: {
    event: string;
    props?: Record<string, unknown>;
  }[];
}

async function setupDeterministicEnvironment(context: BrowserContext): Promise<void> {
  await context.clock.setFixedTime(new Date('2026-10-27T15:00:00+03:00'));

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

test.describe('K4-P1: Матрица продуктовых сценариев (360×780, VITE_API_MOCKS=true)', () => {
  test.beforeEach(async ({ context }) => {
    await setupDeterministicEnvironment(context);
  });

  test('S1-01, S1-02, S1-08: Старт без регистрации → разбор ссылки (до 3 кандидатов) → сохранение и защита от дубликата', async ({
    page,
  }) => {
    // S1-01: Старт без регистрации (/welcome)
    await page.goto('/');
    await expect(page).toHaveURL(/\/welcome$/);
    await expect(
      page.getByRole('heading', { name: 'Увидел в рилсах — сходи вживую' }),
    ).toBeVisible();
    await expect(page.getByText('Без регистрации. Имя и телефон не нужны.')).toBeVisible();
    await expect(page.locator('input[type="email"], input[type="tel"]')).toHaveCount(0);
    await saveDayAndNightScreenshots(page, 's1-01-welcome');

    // S1-02: Экран добавления ссылки (/add) и разбор в до 3 кандидатов
    await page.goto('/add');
    await expect(page.getByRole('heading', { name: 'Добавить место' })).toBeVisible();
    await saveDayAndNightScreenshots(page, 's1-02a-add-input');

    await page.getByLabel('Ссылка на ролик').fill('https://www.instagram.com/reel/hype-coffee/');
    await page.getByRole('button', { name: 'Вставить ссылку' }).click();

    await expect(page.getByRole('heading', { name: 'Это оно?' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Нашли 3 места из ролика')).toBeVisible();

    const primary = page.locator(
      '[data-candidate-id="zhuk-i-pchela"][data-candidate-state="primary"]',
    );
    await expect(primary).toContainText('Жук и Пчела');
    await expect(primary).toContainText('ул. Мясницкая, 24');
    await expect(primary).toContainText('м. Чистые пруды');
    await saveDayAndNightScreenshots(page, 's1-02b-candidates');

    // До нажатия «Да, сохранить» место не сохранено в базе
    const countBeforeSave = await page.evaluate((key) => {
      const raw = window.localStorage.getItem(key);
      if (!raw) return 0;
      return ((JSON.parse(raw) as StoredMockDb).savedPlaces ?? []).length;
    }, MOCK_DB_STORAGE_KEY);
    expect(countBeforeSave).toBe(0);

    await page.getByRole('button', { name: 'Да, сохранить' }).click();
    await expect(page).toHaveURL(/\/place\/zhuk-i-pchela$/);

    // S1-08: Повторная отправка той же ссылки → «Уже в твоих местах» без дубликата
    await page.goto('/add');
    await page.getByRole('button', { name: 'Пример: кофейня' }).click();
    const savedCandidate = page.locator(
      '[data-candidate-id="zhuk-i-pchela"][data-candidate-state="saved"]',
    );
    await expect(savedCandidate).toContainText('Уже в твоих местах', { timeout: 15_000 });
    await expect(savedCandidate.getByRole('button', { name: 'Открыть' })).toBeVisible();
    await saveDayAndNightScreenshots(page, 's1-08-duplicate-candidate');
  });

  test('S1-03, S1-04, S1-05: Трудные случаи Сценария 1 — видеофайл (DEF-01), подборка из N мест (DEF-02), сеть без адреса CHAIN_AMBIGUOUS (DEF-03)', async ({
    page,
  }) => {
    // S1-03: Отправка видеофайла вместо ссылки (в вебе нет input[type=file], строка с именем файла уходит в фоллбэк поиска)
    await page.goto('/add');
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
    await page.getByLabel('Ссылка на ролик').fill('video_reel_tsaritsyno.mp4');
    await page.getByRole('button', { name: 'Вставить ссылку' }).click();
    await expect(page.getByText('Не узнали место')).toBeVisible({ timeout: 15_000 });
    await saveDayAndNightScreenshots(page, 's1-03-video-file-fallback');

    // S1-04: Подборка из 5 мест в одном ролике (1 ролик → N мест: веб обрезает до MAX_CANDIDATES=3 и не имеет чеклиста мультивыбора)
    await page.goto('/add');
    await page
      .getByLabel('Ссылка на ролик')
      .fill('https://www.instagram.com/reel/top-5-bars-moscow/');
    await page.getByRole('button', { name: 'Вставить ссылку' }).click();
    await expect(page.getByRole('heading', { name: 'Это оно?' })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-candidate-id]')).toHaveCount(3);
    await expect(page.locator('input[type="checkbox"]')).toHaveCount(0);
    await saveDayAndNightScreenshots(page, 's1-04-multi-places-reel');

    // S1-05: Сеть без адреса в ролике (CHAIN_AMBIGUOUS, напр. Surf Coffee без улицы/метро: мок-резолвер возвращает 3 точки без плашки сети)
    await page.goto('/add');
    await page
      .getByLabel('Ссылка на ролик')
      .fill('https://www.instagram.com/reel/surf-coffee-chain/');
    await page.getByRole('button', { name: 'Вставить ссылку' }).click();
    await expect(page.getByRole('heading', { name: 'Это оно?' })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-candidate-id]')).toHaveCount(3);
    await expect(page.getByText(/филиал|сеть/i)).toHaveCount(0);
    await saveDayAndNightScreenshots(page, 's1-05-chain-no-address');
  });

  test('S1-06, S1-07: Ошибка пустой ссылки, закрытый аккаунт (private) → ручной поиск по названию и заявка «Не нашли место? → Сообщить»', async ({
    page,
  }) => {
    // S1-06a: Пустая ссылка → ошибка валидации на форме
    await page.goto('/add');
    await page.getByRole('button', { name: 'Вставить ссылку' }).click();
    await expect(
      page.getByText('Вставь ссылку на ролик или выбери поиск по названию'),
    ).toBeVisible();
    await saveDayAndNightScreenshots(page, 's1-06a-empty-link-error');

    // S1-06b: Закрытый аккаунт / приватный ролик → фоллбэк в поиск с сохранением ссылки
    await page
      .getByLabel('Ссылка на ролик')
      .fill('https://www.instagram.com/reel/private-account-spot/');
    await page.getByRole('button', { name: 'Вставить ссылку' }).click();
    await expect(page.getByText('Не узнали место')).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText('Ролик закрыт или в нём нет адреса. Напиши название, найдём сами.'),
    ).toBeVisible();
    await expect(page.getByLabel('Ссылка на ролик')).toHaveValue(
      'https://www.instagram.com/reel/private-account-spot/',
    );
    await saveDayAndNightScreenshots(page, 's1-06b-private-link-fallback');

    // S1-07b: Место отсутствует в базе → «Не нашли место?» → «Сообщить» сохраняет репорт
    const searchInput = page.getByLabel('Название места');
    await searchInput.fill('С');
    await expect(page.getByText('Набери ещё букву')).toBeVisible();

    await searchInput.fill('Несуществующий Гастробар 2099');
    await expect(page.getByText('Не нашли место?')).toBeVisible();
    await saveDayAndNightScreenshots(page, 's1-07b-not-found-report');

    await page.getByRole('button', { name: 'Сообщить' }).click();
    await expect(
      page.getByText('Заявка отправлена — проверим и добавим место в базу.'),
    ).toBeVisible();

    const reportsCount = await page.evaluate((key) => {
      const raw = window.localStorage.getItem(key);
      if (!raw) return 0;
      return ((JSON.parse(raw) as StoredMockDb).reports ?? []).length;
    }, MOCK_DB_STORAGE_KEY);
    expect(reportsCount).toBe(1);

    // S1-07a: Поиск существующего места по названию («Сосны») → сохранение с привязкой к ссылке
    await searchInput.fill('Сосны');
    await expect(page.getByRole('listbox', { name: 'Подсказки' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Да, сохранить' })).toBeVisible();
    await saveDayAndNightScreenshots(page, 's1-07a-search-suggestions');

    await page.getByRole('button', { name: 'Да, сохранить' }).click();
    await expect(page).toHaveURL(/\/place\/sosny$/);
    await expect(page.getByTestId('place-title')).toHaveText('Сосны');
  });

  test('MP-01, MP-02, MP-03: «Мои места» — пусто, отказ гео (выбор метро), карта/список и фильтр «на вечер» (включая пустую выдачу)', async ({
    page,
  }) => {
    // MP-01: Пустое состояние карты «Мои места»
    await startSessionAndOpenMap(page);
    await expect(page.getByRole('heading', { name: 'Пока пусто' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Кинь ссылку' })).toBeVisible();
    await saveDayAndNightScreenshots(page, 'mp-01-empty-map');

    // MP-02a: Отказ в геолокации → экран выбора станции метро как точки отсчёта
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition: (_success: PositionCallback, error?: PositionErrorCallback) => {
            error?.({
              code: 1,
              message: 'User denied Geolocation',
              PERMISSION_DENIED: 1,
              POSITION_UNAVAILABLE: 2,
              TIMEOUT: 3,
            });
          },
        },
      });
    });
    await page.getByRole('button', { name: 'Где я' }).click();
    await expect(page.getByRole('heading', { name: 'От какого метро считать?' })).toBeVisible();
    await page.getByRole('radio', { name: /Китай-город/i }).click();
    await saveDayAndNightScreenshots(page, 'mp-02a-metro-picker');

    await page.getByRole('button', { name: 'Считать от «Китай-города»' }).click();
    await expect(page.getByRole('button', { name: /Станция отсчёта: Китай-город/i })).toBeVisible();

    // MP-02b: Карта и список мест по расстоянию
    await page.getByRole('button', { name: 'Демо: добавить 8 мест' }).click();
    const placeRows = page.locator('[data-place-id]');
    await expect(placeRows).toHaveCount(8, { timeout: 10_000 });
    await saveDayAndNightScreenshots(page, 'mp-02b-map-and-list');

    // MP-03a: Фильтр «на вечер» (открыто в 19:00, до 1 500 ₽, места без часов помечены «Часы не уточнены»)
    await page.getByTestId('evening-filter-trigger').click();
    await expect(page.getByTestId('evening-filter-sheet')).toBeVisible();
    await page.getByRole('button', { name: '19:00' }).click();
    await page.getByRole('button', { name: /до 1500 ₽/i }).click();
    await saveDayAndNightScreenshots(page, 'mp-03a-filter-sheet');

    await page.getByTestId('evening-filter-submit').click();
    await expect(placeRows).toHaveCount(4);
    await expect(page.locator('[data-place-id="zhuravli"]')).toContainText('Часы не уточнены');
    await saveDayAndNightScreenshots(page, 'mp-03b-filtered-list');

    // MP-03c: Трудный случай — пустая выдача фильтра → «Ничего не подошло» → «Сбросить фильтры»
    await page.getByTestId('evening-filter-trigger').click();
    await page.getByRole('button', { name: '23:00' }).click();
    await page.getByRole('button', { name: 'Бар' }).click();
    await page.getByRole('button', { name: /до 1000 ₽/i }).click();
    await page.getByRole('switch', { name: /Рядом с метро/i }).click();
    await page.getByTestId('evening-filter-submit').click();

    await expect(page.getByRole('heading', { name: 'Ничего не подошло' })).toBeVisible();
    await saveDayAndNightScreenshots(page, 'mp-03c-filter-empty');

    await page.getByRole('button', { name: 'Сбросить фильтры' }).click();
    await expect(placeRows).toHaveCount(8);
  });

  test('MP-04, MP-05, MP-06, MP-07: Карточка места, маршрут/отзывы в Яндекс Картах (и проверка 2ГИС DEF-04), заметка до 280 символов, удаление с отменой 5 с', async ({
    page,
  }) => {
    await startSessionAndOpenMap(page);
    await page.getByRole('button', { name: 'Демо: добавить 8 мест' }).click();
    await expect(page.locator('[data-place-id]')).toHaveCount(8, { timeout: 10_000 });

    // MP-04 & MP-05: Карточка места, маршрут и отзывы в Яндекс Картах
    await page.locator('[data-place-id="pokrovka-coffee"]').click();
    await expect(page).toHaveURL(/\/place\/pokrovka-coffee$/);
    await expect(page.getByTestId('place-title')).toHaveText('Кофейня во дворе');
    await expect(page.getByTestId('place-address')).toHaveText('ул. Покровка, 17');
    await expect(page.getByTestId('place-hours-status')).toContainText('Открыто до 21:00');
    await expect(page.getByTestId('place-price')).toContainText('700 ₽');

    const routeBtn = page.getByTestId('place-route-button');
    await expect(routeBtn).toHaveAttribute('data-scheme-url', /^yandexmaps:\/\/maps\.yandex\.ru\//);
    await expect(routeBtn).toHaveAttribute('data-web-url', /^https:\/\/yandex\.ru\/maps\//);
    await expect(page.getByTestId('place-reviews-link')).toHaveAttribute(
      'href',
      /https:\/\/yandex\.ru\/maps\//,
    );
    // DEF-04: В веб-карточке отсутствует кнопка маршрута/отзывов в 2ГИС
    await expect(page.getByRole('link', { name: /2ГИС|2gis/i })).toHaveCount(0);
    await saveDayAndNightScreenshots(page, 'mp-04-place-card');

    // MP-06: Редактирование и сохранение личной заметки до 280 символов
    await page.getByRole('button', { name: 'Изменить' }).click();
    const noteInput = page.getByLabel('Моя заметка');
    await expect(noteInput).toBeVisible();
    await noteInput.fill('Вкусный фильтр-кофе и тихий столик у окна во дворе');
    await expect(page.getByTestId('note-view-counter')).toHaveText('50/280');
    await saveDayAndNightScreenshots(page, 'mp-06-note-editing');

    await page.getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.getByTestId('note-view-text')).toHaveText(
      'Вкусный фильтр-кофе и тихий столик у окна во дворе',
    );

    // MP-07: Удаление места с отменой в течение 5 секунд
    await page.getByTestId('delete-place-button').click();
    await expect(page.getByText('Место удалено')).toBeVisible();
    const undoBtn = page.getByRole('button', { name: 'Отменить' });
    await expect(undoBtn).toBeVisible();
    await saveDayAndNightScreenshots(page, 'mp-07-delete-undo-toast');

    await undoBtn.click();
    await expect(page.getByText('Место удалено')).toBeHidden();
    await expect(page.getByTestId('place-title')).toHaveText('Кофейня во дворе');
  });

  test('SL-01, SL-02, SL-03, SL-04: Шорт-лист «На вечер», голосование друга без VPN и трудные случаи ссылок (expired / 404)', async ({
    page,
  }) => {
    await startSessionAndOpenMap(page);

    // SL-01a: Пустой шорт-лист «На вечер» (кнопка «Отправить» неактивна)
    await page.getByRole('link', { name: /На вечер/ }).click();
    await expect(page).toHaveURL(/\/evening$/);
    await expect(page.getByTestId('evening-empty')).toBeVisible();
    await expect(page.getByTestId('evening-share-button')).toBeDisabled();
    await saveDayAndNightScreenshots(page, 'sl-01a-evening-empty');

    // Добавляем 2 места и делимся ссылкой
    await page.getByRole('link', { name: 'Места' }).click();
    await page.getByRole('button', { name: 'Демо: добавить 8 мест' }).click();
    await expect(page.locator('[data-place-id]')).toHaveCount(8, { timeout: 10_000 });

    await page.getByTestId('shortlist-row-toggle-zhuravli').click();
    await page.getByTestId('shortlist-row-toggle-pokrovka-coffee').click();

    await page.getByRole('link', { name: /На вечер/ }).click();
    await expect(page.getByTestId('evening-share-button')).toBeEnabled();
    await page.getByTestId('evening-share-button').click();
    await saveDayAndNightScreenshots(page, 'sl-01b-evening-ready');

    // SL-02: Страница друга по ссылке /s/evening-demo без установки, голос «Мне подходит» + идемпотентность
    const friendPopupPromise = page.waitForEvent('popup');
    await page.getByTestId('evening-open-as-friend').click();
    const friendPage = await friendPopupPromise;

    await expect(friendPage).toHaveURL(/\/s\/evening-demo$/);
    await expect(friendPage.getByRole('heading', { name: 'Куда в пятницу?' })).toBeVisible();

    const voteZhuravli = friendPage.getByTestId('vote-button-zhuravli');
    const votePokrovka = friendPage.getByTestId('vote-button-pokrovka-coffee');
    await voteZhuravli.click();
    await expect(voteZhuravli).toContainText('Подходит');
    await expect(friendPage.getByTestId('friend-voters-summary')).toContainText('уже ответил 1');

    // Повторное голосование из того же браузера за второе место не создаёт второго голосующего
    await votePokrovka.click();
    await expect(friendPage.getByTestId('friend-voters-summary')).toContainText('уже ответил 1');
    await votePokrovka.click();
    await saveDayAndNightScreenshots(friendPage, 'sl-02a-friend-vote');
    await friendPage.close();

    // Автор видит голос друга и лидера подборки
    await page.bringToFront();
    await page.evaluate(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await expect(page.getByTestId('shortlist-leader')).toContainText('Лидирует Журавли — 1 из 1.');
    await saveDayAndNightScreenshots(page, 'sl-02b-author-votes');

    // SL-04a: Трудный случай — устаревшая ссылка шорт-листа (/s/expired → 410)
    await page.goto('/s/expired');
    await expect(page.getByText('Ссылка устарела')).toBeVisible();
    await saveDayAndNightScreenshots(page, 'sl-04a-friend-expired');

    // SL-04b: Трудный случай — несуществующая ссылка шорт-листа (/s/missing-token → 404)
    await page.goto('/s/missing-token');
    await expect(page.getByText('Подборка не найдена')).toBeVisible();
    await saveDayAndNightScreenshots(page, 'sl-04b-friend-not-found');
  });

  test('VZ-01, VZ-02, VZ-03: Отметка визита «Я здесь» (≤200 м и >200 м, лимит 1/день, ожидания) и возврат «Сходили вчера?»', async ({
    page,
  }) => {
    await startSessionAndOpenMap(page);
    await page.getByRole('button', { name: 'Демо: добавить 8 мест' }).click();
    await expect(page.locator('[data-place-id]')).toHaveCount(8, { timeout: 10_000 });

    await page.locator('[data-place-id="zhuravli"]').click();
    await expect(page).toHaveURL(/\/place\/zhuravli$/);

    // VZ-01: Отметка визита с гео ≤ 200 м («подтверждён · рядом, до 200 м»)
    await page.getByTestId('mark-visit-button').click();
    await expect(page.getByTestId('mark-visit-modal')).toBeVisible();
    await expect(page.getByTestId('mark-visit-verification')).toContainText(
      'подтверждён · рядом, до 200 м',
    );
    await page.getByTestId('expectation-chip-better').click();
    await page.getByTestId('mark-visit-comment').fill('Отличный сухой сидр и уютный двор');
    await saveDayAndNightScreenshots(page, 'vz-01-visit-verified');

    // VZ-02: Трудный случай — переключение «Демо: я далеко» (> 200 м → «без проверки · ты дальше 200 м»)
    await page.getByTestId('mark-visit-demo-toggle').click();
    await expect(page.getByTestId('mark-visit-verification')).toContainText(
      'без проверки · ты дальше 200 м',
    );
    await saveDayAndNightScreenshots(page, 'vz-02-visit-unverified');

    await page.getByTestId('mark-visit-submit').click();
    await expect(page.getByTestId('mark-visit-modal')).toBeHidden();

    // Лимит 1 визит в день: кнопка неактивна с подписью «Не больше одного визита в место за день»
    await expect(page.getByTestId('mark-visit-button')).toBeDisabled();
    await expect(page.getByText('Не больше одного визита в место за день')).toBeVisible();

    // VZ-03: Опрос на следующий день после шеринга шорт-листа («Сходили вчера?»)
    await page.goto('/?yesterdayCheck=1');
    await expect(page.getByTestId('yesterday-check-modal')).toBeVisible();
    await expect(page.getByTestId('yesterday-check-title')).toHaveText('Сходили вчера?');
    await page.locator('[data-testid^="yesterday-check-place-"]').first().click();
    await expect(page.getByTestId('yesterday-check-done')).toBeVisible();
    await saveDayAndNightScreenshots(page, 'vz-03-yesterday-check');

    await page.getByTestId('yesterday-check-done').click();
    await expect(page.getByTestId('yesterday-check-modal')).toBeHidden();
  });
});
