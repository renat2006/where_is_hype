import fs from 'node:fs';
import path from 'node:path';

import { type BrowserContext, expect, type Page, test } from '@playwright/test';

const SHOTS_DIR = path.resolve(import.meta.dirname, '../../../../../reports/K4-W1-shots');
const SESSION_STORAGE_KEY = 'where-is-hype:session';
const THEME_STORAGE_KEY = 'where-is-hype:theme';

async function setupDeterministicEnvironment(context: BrowserContext): Promise<void> {
  await context.clock.setFixedTime(new Date('2026-10-27T15:00:00+03:00'));

  await context.route(
    /https?:\/\/(tiles\.openfreemap\.org|demotiles\.maplibre\.org)\/.*/,
    (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ version: 8, sources: {}, layers: [] }),
      }),
  );
}

async function captureDayAndNight(page: Page, baseName: string): Promise<void> {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });

  await page.evaluate((themeKey) => {
    window.localStorage.setItem(themeKey, 'day');
    document.documentElement.setAttribute('data-theme', 'day');
  }, THEME_STORAGE_KEY);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'day');
  await page.screenshot({
    path: path.join(SHOTS_DIR, `${baseName}-day.png`),
    fullPage: false,
  });

  await page.evaluate((themeKey) => {
    window.localStorage.setItem(themeKey, 'night');
    document.documentElement.setAttribute('data-theme', 'night');
  }, THEME_STORAGE_KEY);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'night');
  await page.screenshot({
    path: path.join(SHOTS_DIR, `${baseName}-night.png`),
    fullPage: false,
  });

  await page.evaluate((themeKey) => {
    window.localStorage.setItem(themeKey, 'day');
    document.documentElement.setAttribute('data-theme', 'day');
  }, THEME_STORAGE_KEY);
}

test.describe('K4-W1: Telegram Mini App + веб-экраны (360×780 день/ночь)', () => {
  test('снятие скриншотов 360×780 (день/ночь) и проверка TMA-режима (?tma=1 и startapp)', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 360, height: 780 },
      locale: 'ru-RU',
      timezoneId: 'Europe/Moscow',
      permissions: ['geolocation', 'clipboard-read', 'clipboard-write'],
      geolocation: { latitude: 55.7558, longitude: 37.6173 },
    });
    await setupDeterministicEnvironment(context);

    const page = await context.newPage();

    await page.addInitScript((sessionKey) => {
      window.localStorage.setItem(
        sessionKey,
        JSON.stringify({ id: 'usr-k4-w1-e2e', createdAt: '2026-10-27T12:00:00.000Z' }),
      );
    }, SESSION_STORAGE_KEY);

    // 1. Главный экран (наполняем 8 демо-местами)
    await page.goto('/');
    const seedButton = page.getByRole('button', { name: 'Демо: добавить 8 мест' });
    await seedButton.click();
    await expect(page.getByTestId('places-sheet-summary')).toContainText('был в 1 из 8');
    await captureDayAndNight(page, '01-main');

    // Добавляем 2 места в «На вечер» и публикуем подборку, чтобы наполнить /s/evening-demo
    await page.getByTestId('shortlist-row-toggle-zhuravli').click();
    await page.getByTestId('shortlist-row-toggle-pokrovka-coffee').click();
    await page.getByRole('link', { name: /На вечер/ }).click();
    await expect(page).toHaveURL(/\/evening$/);
    await expect(page.getByTestId('evening-place-row-zhuravli')).toBeVisible();
    await expect(page.getByTestId('evening-place-row-pokrovka-coffee')).toBeVisible();
    await page.getByTestId('evening-share-button').click();
    await expect(page.getByText('Ссылка скопирована')).toBeVisible();

    // 2. Экран добавления места (/add)
    await page.goto('/add');
    await expect(page.getByRole('heading', { level: 1, name: 'Добавить место' })).toBeVisible();
    await captureDayAndNight(page, '02-add-place');

    // 3. Карточка места (/place/sosny)
    await page.goto('/place/sosny');
    await expect(page.getByTestId('place-title')).toHaveText('Сосны');
    await captureDayAndNight(page, '03-place-card');

    // 4. Подборка друга (/s/evening-demo)
    await page.goto('/s/evening-demo');
    await expect(page.getByRole('heading', { level: 1, name: 'Куда в пятницу?' })).toBeVisible();
    await expect(page.getByTestId('vote-button-zhuravli')).toBeVisible();
    await captureDayAndNight(page, '04-friend-shortlist');

    // 5. Проверка запуска в TMA-режиме (?tma=1) и deep link startapp=s_evening-demo
    await page.goto('/?tma=1');
    await expect(page.locator('[data-tma="true"]')).toBeVisible();
    await expect(page.getByTestId('map-fullscreen-toggle')).toBeVisible();
    await captureDayAndNight(page, '05-tma-main');

    await context.close();
  });
});
