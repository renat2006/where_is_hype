import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  consumeInitialTelegramDeepLink,
  enableTelegramMockEnv,
  getHomeScreenStatus,
  initTelegramRuntime,
  isTelegramMiniApp,
  openExternalUrl,
  parseTelegramStartParam,
  promptAddToHomeScreen,
  resetTelegramRuntimeForTests,
  setTelegramVerticalSwipeLocked,
  shareShortlistViaTelegram,
  shareViaTelegramInlineQuery,
  shouldMockTelegramFromLocation,
  telegramStorage,
  toggleTelegramFullscreen,
  triggerTelegramHaptic,
  useTelegramBackButton,
  useTelegramMainButton,
  useTelegramSecondaryButton,
  useTelegramSwipeLock,
} from './index';

function TestTmaScreen({
  onBack,
  onMain,
  onSecondary,
}: {
  onBack: () => void;
  onMain: () => void;
  onSecondary: () => void;
}) {
  const { isNativeBackVisible } = useTelegramBackButton(onBack, true);
  const { isNativeMainButtonVisible } = useTelegramMainButton({
    text: 'Добавить место',
    onClick: onMain,
    isVisible: true,
  });
  const { isNativeSecondaryButtonVisible } = useTelegramSecondaryButton({
    text: 'В «На вечер»',
    onClick: onSecondary,
    isVisible: true,
  });
  useTelegramSwipeLock(true);

  return (
    <div>
      <span data-testid="native-back">{String(isNativeBackVisible)}</span>
      <span data-testid="native-main">{String(isNativeMainButtonVisible)}</span>
      <span data-testid="native-secondary">{String(isNativeSecondaryButtonVisible)}</span>
      {!isNativeBackVisible && (
        <button type="button" onClick={onBack}>
          Веб-назад
        </button>
      )}
    </div>
  );
}

describe('shared/telegram', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetTelegramRuntimeForTests();
  });

  afterEach(() => {
    resetTelegramRuntimeForTests();
    vi.restoreAllMocks();
  });

  describe('parseTelegramStartParam', () => {
    it('parses shortlist and place start_param formats into internal routes', () => {
      expect(parseTelegramStartParam('s_demo_token_1')).toBe('/s/demo_token_1');
      expect(parseTelegramStartParam('shortlist_abc-123')).toBe('/s/abc-123');
      expect(parseTelegramStartParam('shortlist:xyz_9')).toBe('/s/xyz_9');
      expect(parseTelegramStartParam('place_place-romeo')).toBe('/place/place-romeo');
      expect(parseTelegramStartParam('p_place-42')).toBe('/place/place-42');
      expect(parseTelegramStartParam('add')).toBe('/add');
      expect(parseTelegramStartParam('evening')).toBe('/evening');
      expect(parseTelegramStartParam('settings')).toBe('/settings');
      expect(parseTelegramStartParam('')).toBeNull();
      expect(parseTelegramStartParam(null)).toBeNull();
      expect(parseTelegramStartParam('unknown_param')).toBeNull();
    });

    it('detects mock flags from URL search query', () => {
      expect(shouldMockTelegramFromLocation('?tma=1&tma_theme=night&startapp=s_tok1')).toEqual({
        enabled: true,
        theme: 'night',
        startParam: 's_tok1',
      });
      expect(shouldMockTelegramFromLocation('')).toEqual({ enabled: false });
    });
  });

  describe('regular web browser mode (outside Telegram)', () => {
    it('initializes safely as standard web app when not inside TMA', () => {
      const state = initTelegramRuntime();

      expect(state.isTma).toBe(false);
      expect(isTelegramMiniApp()).toBe(false);
      expect(state.platform).toBe('web');
      expect(document.documentElement.style.getPropertyValue('--tg-safe-area-inset-top')).toBe(
        '0px',
      );
      expect(triggerTelegramHaptic('save')).toBe(false);
      expect(setTelegramVerticalSwipeLocked(true)).toBe(false);
      expect(promptAddToHomeScreen()).toBe(false);
    });

    it('uses localStorage and clipboard fallback outside TMA', async () => {
      initTelegramRuntime();

      await telegramStorage.setItem('where-is-hype:test-draft', 'https://ya.cc/t/123');
      expect(await telegramStorage.getItem('where-is-hype:test-draft')).toBe('https://ya.cc/t/123');

      await telegramStorage.deleteItem('where-is-hype:test-draft');
      expect(await telegramStorage.getItem('where-is-hype:test-draft')).toBeNull();

      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: { writeText },
      });

      const shareResult = await shareShortlistViaTelegram({
        url: 'https://hype.example/s/tok_1',
        title: 'Шорт-лист на вечер',
        places: ['Сюр', 'Ровесник'],
      });
      expect(shareResult).toBe('copied');
      expect(writeText).toHaveBeenCalledWith('https://hype.example/s/tok_1');
    });

    it('renders fallback web controls when hooks run outside TMA', () => {
      initTelegramRuntime();
      const onBack = vi.fn();
      const onMain = vi.fn();
      const onSecondary = vi.fn();

      render(<TestTmaScreen onBack={onBack} onMain={onMain} onSecondary={onSecondary} />);

      expect(screen.getByTestId('native-back')).toHaveTextContent('false');
      expect(screen.getByTestId('native-main')).toHaveTextContent('false');
      expect(screen.getByTestId('native-secondary')).toHaveTextContent('false');

      fireEvent.click(screen.getByRole('button', { name: 'Веб-назад' }));
      expect(onBack).toHaveBeenCalledTimes(1);
    });
  });

  describe('Telegram Mini App mode (with mockTelegramEnv)', () => {
    it('initializes TMA runtime, theme tokens, launchParams, and deep link from start_param', () => {
      const bridgeEvents: { name: string; params?: unknown }[] = [];

      enableTelegramMockEnv({
        theme: 'night',
        startParam: 's_evening_77',
        version: '9.0',
        platform: 'ios',
        onBridgeEvent: (ev) => bridgeEvents.push(ev),
      });

      const state = initTelegramRuntime();

      expect(state.isTma).toBe(true);
      expect(isTelegramMiniApp()).toBe(true);
      expect(state.platform).toBe('ios');
      expect(state.version).toBe('9.0');
      expect(state.user?.firstName).toBe('Аня');
      expect(state.startParam).toBe('s_evening_77');
      expect(state.deepLinkPath).toBe('/s/evening_77');
      expect(consumeInitialTelegramDeepLink()).toBe('/s/evening_77');
      expect(consumeInitialTelegramDeepLink()).toBeNull();

      expect(document.documentElement.getAttribute('data-theme')).toBe('night');
      expect(document.documentElement.style.getPropertyValue('--tg-theme-bg-color')).toBe(
        '#16130f',
      );
      expect(bridgeEvents.some((e) => e.name === 'web_app_ready')).toBe(true);
      expect(bridgeEvents.some((e) => e.name === 'web_app_expand')).toBe(true);
    });

    it('triggers native haptics, swipe lock, fullscreen, storage, links, and buttons in TMA', async () => {
      const bridgeEvents: { name: string; params?: unknown }[] = [];

      enableTelegramMockEnv({
        theme: 'day',
        version: '9.0',
        platform: 'android',
        onBridgeEvent: (ev) => bridgeEvents.push(ev),
      });
      initTelegramRuntime();

      expect(triggerTelegramHaptic('save')).toBe(true);
      expect(triggerTelegramHaptic('vote')).toBe(true);
      expect(triggerTelegramHaptic('error')).toBe(true);
      expect(triggerTelegramHaptic('impact')).toBe(true);
      expect(bridgeEvents.some((e) => e.name === 'web_app_trigger_haptic_feedback')).toBe(true);

      expect(setTelegramVerticalSwipeLocked(true)).toBe(true);
      expect(
        bridgeEvents.some(
          (e) =>
            e.name === 'web_app_setup_swipe_behavior' &&
            (e.params as { allow_vertical_swipe?: boolean }).allow_vertical_swipe === false,
        ),
      ).toBe(true);

      const isFs = await toggleTelegramFullscreen();
      expect(isFs).toBe(true);
      const isFsAfterExit = await toggleTelegramFullscreen();
      expect(isFsAfterExit).toBe(false);

      await telegramStorage.setItem('where-is-hype:session', '{"userId":"u1"}');
      const stored = await telegramStorage.getItem('where-is-hype:session');
      expect(stored).toBe('{"userId":"u1"}');

      openExternalUrl('https://yandex.ru/maps/?pt=37.61,55.75');
      expect(bridgeEvents.some((e) => e.name === 'web_app_open_link')).toBe(true);

      expect(shareViaTelegramInlineQuery('s_demo_1')).toBe(true);
      expect(bridgeEvents.some((e) => e.name === 'web_app_switch_inline_query')).toBe(true);

      expect(promptAddToHomeScreen()).toBe(true);
      expect(bridgeEvents.some((e) => e.name === 'web_app_add_to_home_screen')).toBe(true);
      expect(await getHomeScreenStatus()).toBe('missed');
    });

    it('mounts native BackButton, MainButton, and SecondaryButton via hooks in TMA', () => {
      const bridgeEvents: { name: string; params?: unknown }[] = [];

      enableTelegramMockEnv({
        theme: 'day',
        version: '8.0',
        platform: 'ios',
        onBridgeEvent: (ev) => bridgeEvents.push(ev),
      });
      initTelegramRuntime();

      const onBack = vi.fn();
      const onMain = vi.fn();
      const onSecondary = vi.fn();

      const { unmount } = render(
        <TestTmaScreen onBack={onBack} onMain={onMain} onSecondary={onSecondary} />,
      );

      expect(screen.getByTestId('native-back')).toHaveTextContent('true');
      expect(screen.getByTestId('native-main')).toHaveTextContent('true');
      expect(screen.getByTestId('native-secondary')).toHaveTextContent('true');
      expect(screen.queryByRole('button', { name: 'Веб-назад' })).toBeNull();

      expect(
        bridgeEvents.some(
          (e) =>
            e.name === 'web_app_setup_back_button' &&
            (e.params as { is_visible?: boolean } | undefined)?.is_visible === true,
        ),
      ).toBe(true);
      expect(
        bridgeEvents.some(
          (e) =>
            e.name === 'web_app_setup_main_button' &&
            (e.params as { text?: string } | undefined)?.text === 'Добавить место',
        ),
      ).toBe(true);
      expect(
        bridgeEvents.some(
          (e) =>
            e.name === 'web_app_setup_secondary_button' &&
            (e.params as { text?: string } | undefined)?.text === 'В «На вечер»',
        ),
      ).toBe(true);

      unmount();
    });
  });
});
