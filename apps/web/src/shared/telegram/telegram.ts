import {
  addToHomeScreen,
  backButton,
  checkHomeScreenStatus,
  cloudStorage,
  deviceStorage,
  emitEvent,
  hapticFeedback,
  type HomeScreenStatus,
  init,
  initData,
  isTMA,
  mainButton,
  miniApp,
  mockTelegramEnv,
  openLink,
  retrieveLaunchParams,
  secondaryButton,
  type SecondaryButtonPosition,
  shareMessage,
  shareURL,
  swipeBehavior,
  switchInlineQuery,
  type SwitchInlineQueryChatType,
  themeParams,
  viewport,
} from '@tma.js/sdk-react';

import {
  applyThemeToDocument,
  type ResolvedTheme,
  setThemeMode,
  THEME_COLOR_BY_RESOLVED,
} from '@/shared/lib/theme';

export type TelegramHapticKind =
  'save' | 'vote' | 'visit' | 'success' | 'error' | 'warning' | 'select' | 'impact';

export interface TelegramUserSummary {
  id: number;
  firstName: string;
  lastName?: string | undefined;
  username?: string | undefined;
  languageCode?: string | undefined;
}

export interface TelegramSafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface TelegramRuntimeState {
  isTma: boolean;
  platform: string;
  version: string | null;
  startParam: string | null;
  deepLinkPath: string | null;
  user: TelegramUserSummary | null;
  isFullscreen: boolean;
  isFullscreenSupported: boolean;
  safeAreaInsets: TelegramSafeAreaInsets;
  contentSafeAreaInsets: TelegramSafeAreaInsets;
}

export interface TelegramMockOptions {
  theme?: ResolvedTheme | undefined;
  startParam?: string | undefined;
  version?: string | undefined;
  platform?: string | undefined;
  user?: TelegramUserSummary | undefined;
  onBridgeEvent?: ((event: { name: string; params?: unknown }) => void) | undefined;
}

export interface ShareShortlistTelegramParams {
  url: string;
  title: string;
  places?: string[] | undefined;
  token?: string | undefined;
  preparedMessageId?: string | undefined;
}

export type ShareShortlistResult =
  'shared_message' | 'telegram_url' | 'inline_query' | 'web_share' | 'copied' | 'failed';

const ZERO_INSETS: TelegramSafeAreaInsets = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

const mockMemoryStorage = new Map<string, string>();

let runtimeState: TelegramRuntimeState = {
  isTma: false,
  platform: 'web',
  version: null,
  startParam: null,
  deepLinkPath: null,
  user: null,
  isFullscreen: false,
  isFullscreenSupported: false,
  safeAreaInsets: ZERO_INSETS,
  contentSafeAreaInsets: ZERO_INSETS,
};

let sdkCleanup: (() => void) | null = null;
let deepLinkConsumed = false;
const runtimeListeners = new Set<() => void>();

function notifyRuntimeListeners(): void {
  for (const listener of runtimeListeners) {
    listener();
  }
}

export function subscribeTelegramRuntime(listener: () => void): () => void {
  runtimeListeners.add(listener);
  return () => {
    runtimeListeners.delete(listener);
  };
}

export function getTelegramRuntimeState(): TelegramRuntimeState {
  return runtimeState;
}

export function isTelegramMiniApp(): boolean {
  return runtimeState.isTma;
}

/**
 * Разбирает параметр запуска Telegram (`tgWebAppStartParam` / `start_param` / `?startapp=`)
 * в маршрут внутри приложения:
 * - `s_<token>` или `shortlist_<token>` -> `/s/<token>`
 * - `place_<id>` или `p_<id>` -> `/place/<id>`
 * - `add` -> `/add`
 * - `evening` -> `/evening`
 */
export function parseTelegramStartParam(rawStartParam: string | null | undefined): string | null {
  if (!rawStartParam) {
    return null;
  }

  const trimmed = rawStartParam.trim();
  if (!trimmed) {
    return null;
  }

  const shortlistMatch = /^(?:s|shortlist)[_:-]([A-Za-z0-9_-]+)$/i.exec(trimmed);
  if (shortlistMatch?.[1]) {
    return `/s/${shortlistMatch[1]}`;
  }

  const placeMatch = /^(?:place|p)[_:-]([A-Za-z0-9_-]+)$/i.exec(trimmed);
  if (placeMatch?.[1]) {
    return `/place/${placeMatch[1]}`;
  }

  if (trimmed === 'add') {
    return '/add';
  }

  if (trimmed === 'evening') {
    return '/evening';
  }

  if (trimmed === 'settings') {
    return '/settings';
  }

  return null;
}

export function consumeInitialTelegramDeepLink(): string | null {
  if (deepLinkConsumed || !runtimeState.deepLinkPath) {
    return null;
  }
  deepLinkConsumed = true;
  return runtimeState.deepLinkPath;
}

export function shouldMockTelegramFromLocation(search?: string): {
  enabled: boolean;
  theme?: ResolvedTheme | undefined;
  startParam?: string | undefined;
} {
  const queryString = search ?? (typeof window !== 'undefined' ? window.location.search : '');
  if (!queryString) {
    return { enabled: false };
  }

  const params = new URLSearchParams(queryString);
  const tmaParam = params.get('tma');
  const enabled = tmaParam === '1' || tmaParam === 'true' || tmaParam === 'mock';
  const rawTheme = params.get('tma_theme');
  const theme: ResolvedTheme | undefined =
    rawTheme === 'night' || rawTheme === 'day' ? rawTheme : undefined;
  const startParam = params.get('tgWebAppStartParam') ?? params.get('startapp') ?? undefined;

  return {
    enabled,
    theme,
    startParam,
  };
}

function getThemePaletteForZin(theme: ResolvedTheme) {
  if (theme === 'night') {
    return {
      bg_color: '#16130f' as const,
      secondary_bg_color: '#221e18' as const,
      header_bg_color: '#16130f' as const,
      bottom_bar_bg_color: '#16130f' as const,
      section_bg_color: '#221e18' as const,
      text_color: '#f2ece1' as const,
      hint_color: '#a79f92' as const,
      subtitle_text_color: '#a79f92' as const,
      link_color: '#ff6a3d' as const,
      accent_text_color: '#ff6a3d' as const,
      button_color: '#ff6a3d' as const,
      button_text_color: '#16130f' as const,
      destructive_text_color: '#ff6a3d' as const,
    };
  }

  return {
    bg_color: '#f4efe6' as const,
    secondary_bg_color: '#fffdf8' as const,
    header_bg_color: '#f4efe6' as const,
    bottom_bar_bg_color: '#f4efe6' as const,
    section_bg_color: '#fffdf8' as const,
    text_color: '#17140f' as const,
    hint_color: '#6b6358' as const,
    subtitle_text_color: '#6b6358' as const,
    link_color: '#d63a0e' as const,
    accent_text_color: '#ff4a1c' as const,
    button_color: '#ff4a1c' as const,
    button_text_color: '#17140f' as const,
    destructive_text_color: '#d63a0e' as const,
  };
}

/**
 * Включает мок-окружение Telegram Mini Apps (`mockTelegramEnv`) для запуска,
 * отладки и тестирования в обычном браузере.
 */
export function enableTelegramMockEnv(options: TelegramMockOptions = {}): void {
  const theme = options.theme ?? 'day';
  const version = options.version ?? '8.0';
  const platform = options.platform ?? 'tdesktop';
  const user: TelegramUserSummary = options.user ?? {
    id: 1042001,
    firstName: 'Аня',
    username: 'anya_hype',
    languageCode: 'ru',
  };

  const palette = getThemePaletteForZin(theme);
  const initDataParams = new URLSearchParams();
  initDataParams.set(
    'user',
    JSON.stringify({
      id: user.id,
      first_name: user.firstName,
      last_name: user.lastName,
      username: user.username,
      language_code: user.languageCode ?? 'ru',
    }),
  );
  initDataParams.set('query_id', 'mock_query_id_0001');
  initDataParams.set('auth_date', '1762646400');
  initDataParams.set('hash', 'mock_tma_hash_signature_0001');
  initDataParams.set('signature', 'mock_tma_ed25519_sig');
  if (options.startParam) {
    initDataParams.set('start_param', options.startParam);
  }

  mockTelegramEnv({
    launchParams: {
      tgWebAppVersion: version,
      tgWebAppPlatform: platform,
      tgWebAppBotInline: true,
      tgWebAppThemeParams: palette,
      tgWebAppData: initDataParams.toString(),
      ...(options.startParam ? { tgWebAppStartParam: options.startParam } : {}),
    },
    onEvent(event) {
      const methodName = event.name;
      const methodParams: unknown = 'params' in event ? event.params : undefined;

      options.onBridgeEvent?.({ name: methodName, params: methodParams });

      if (methodName === 'web_app_request_theme') {
        emitEvent('theme_changed', { theme_params: palette });
      }

      if (methodName === 'web_app_request_viewport') {
        emitEvent('viewport_changed', {
          height: typeof window !== 'undefined' ? window.innerHeight || 780 : 780,
          width: typeof window !== 'undefined' ? window.innerWidth || 360 : 360,
          is_expanded: true,
          is_state_stable: true,
        });
      }

      if (methodName === 'web_app_request_safe_area') {
        emitEvent('safe_area_changed', ZERO_INSETS);
      }

      if (methodName === 'web_app_request_content_safe_area') {
        emitEvent('content_safe_area_changed', ZERO_INSETS);
      }

      if (methodName === 'web_app_request_fullscreen') {
        emitEvent('fullscreen_changed', { is_fullscreen: true });
      }

      if (methodName === 'web_app_exit_fullscreen') {
        emitEvent('fullscreen_changed', { is_fullscreen: false });
      }

      if (methodName === 'web_app_check_home_screen') {
        emitEvent('home_screen_checked', { status: 'missed' });
      }

      if (methodName === 'web_app_add_to_home_screen') {
        emitEvent('home_screen_added');
      }

      if (methodName === 'web_app_device_storage_save_key' && methodParams) {
        const req = methodParams as { req_id: string; key: string; value: string | null };
        if (req.value === null) {
          mockMemoryStorage.delete(req.key);
        } else {
          mockMemoryStorage.set(req.key, req.value);
        }
        emitEvent('device_storage_key_saved', { req_id: req.req_id });
      }

      if (methodName === 'web_app_device_storage_get_key' && methodParams) {
        const req = methodParams as { req_id: string; key: string };
        emitEvent('device_storage_key_received', {
          req_id: req.req_id,
          value: mockMemoryStorage.get(req.key) ?? null,
        });
      }

      if (methodName === 'web_app_device_storage_clear' && methodParams) {
        const req = methodParams as { req_id: string };
        mockMemoryStorage.clear();
        emitEvent('device_storage_cleared', { req_id: req.req_id });
      }

      if (methodName === 'web_app_invoke_custom_method' && methodParams) {
        const custom = methodParams as {
          req_id: string;
          method: string;
          params?: { key?: string; value?: string; keys?: string[] };
        };
        if (custom.method === 'save_storage_value') {
          const key = custom.params?.key ?? '';
          const value = custom.params?.value ?? '';
          mockMemoryStorage.set(key, value);
          emitEvent('custom_method_invoked', {
            req_id: custom.req_id,
            result: true,
          });
        } else if (custom.method === 'get_storage_values') {
          const keys = Array.isArray(custom.params?.keys) ? custom.params.keys : [];
          const result: Record<string, string> = {};
          for (const key of keys) {
            result[key] = mockMemoryStorage.get(key) ?? '';
          }
          emitEvent('custom_method_invoked', {
            req_id: custom.req_id,
            result,
          });
        } else if (custom.method === 'delete_storage_values') {
          const keys = Array.isArray(custom.params?.keys) ? custom.params.keys : [];
          for (const key of keys) {
            mockMemoryStorage.delete(key);
          }
          emitEvent('custom_method_invoked', {
            req_id: custom.req_id,
            result: true,
          });
        } else if (custom.method === 'get_storage_keys') {
          emitEvent('custom_method_invoked', {
            req_id: custom.req_id,
            result: Array.from(mockMemoryStorage.keys()),
          });
        }
      }
    },
  });
}

function applySafeAreaCssVariables(
  safeArea: TelegramSafeAreaInsets,
  contentSafeArea: TelegramSafeAreaInsets,
): void {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  root.style.setProperty('--tg-safe-area-inset-top', `${String(safeArea.top)}px`);
  root.style.setProperty('--tg-safe-area-inset-right', `${String(safeArea.right)}px`);
  root.style.setProperty('--tg-safe-area-inset-bottom', `${String(safeArea.bottom)}px`);
  root.style.setProperty('--tg-safe-area-inset-left', `${String(safeArea.left)}px`);

  root.style.setProperty('--tg-content-safe-area-inset-top', `${String(contentSafeArea.top)}px`);
  root.style.setProperty(
    '--tg-content-safe-area-inset-right',
    `${String(contentSafeArea.right)}px`,
  );
  root.style.setProperty(
    '--tg-content-safe-area-inset-bottom',
    `${String(contentSafeArea.bottom)}px`,
  );
  root.style.setProperty('--tg-content-safe-area-inset-left', `${String(contentSafeArea.left)}px`);
}

/**
 * Синхронизирует `themeParams` и `viewport` Telegram Mini App с CSS-переменными
 * и токенами дизайн-системы «Зин» (`day` / `night`).
 */
export function syncTelegramThemeAndViewport(): void {
  if (typeof document === 'undefined') {
    return;
  }

  if (!runtimeState.isTma) {
    applySafeAreaCssVariables(ZERO_INSETS, ZERO_INSETS);
    return;
  }

  const isDark = themeParams.isDark();
  const resolvedTheme: ResolvedTheme = isDark ? 'night' : 'day';
  const zinPalette = getThemePaletteForZin(resolvedTheme);
  const tpState = themeParams.state();

  const root = document.documentElement;
  root.style.setProperty('--tg-theme-bg-color', tpState.bg_color ?? zinPalette.bg_color);
  root.style.setProperty(
    '--tg-theme-secondary-bg-color',
    tpState.secondary_bg_color ?? zinPalette.secondary_bg_color,
  );
  root.style.setProperty('--tg-theme-text-color', tpState.text_color ?? zinPalette.text_color);
  root.style.setProperty('--tg-theme-hint-color', tpState.hint_color ?? zinPalette.hint_color);
  root.style.setProperty('--tg-theme-link-color', tpState.link_color ?? zinPalette.link_color);
  root.style.setProperty(
    '--tg-theme-button-color',
    tpState.button_color ?? zinPalette.button_color,
  );
  root.style.setProperty(
    '--tg-theme-button-text-color',
    tpState.button_text_color ?? zinPalette.button_text_color,
  );

  setThemeMode(resolvedTheme);
  applyThemeToDocument(resolvedTheme);

  const hostHex = THEME_COLOR_BY_RESOLVED[resolvedTheme];
  miniApp.setBgColor.ifAvailable(hostHex);
  miniApp.setHeaderColor.ifAvailable(hostHex);
  miniApp.setBottomBarColor.ifAvailable(hostHex);

  const safeArea = viewport.safeAreaInsets();
  const contentSafeArea = viewport.contentSafeAreaInsets();
  applySafeAreaCssVariables(safeArea, contentSafeArea);

  runtimeState = {
    ...runtimeState,
    isFullscreen: viewport.isFullscreen(),
    isFullscreenSupported: viewport.requestFullscreen.isSupported(),
    safeAreaInsets: safeArea,
    contentSafeAreaInsets: contentSafeArea,
  };
  notifyRuntimeListeners();
}

/**
 * Инициализирует слой Telegram Mini App (или безопасный веб-фолбэк вне Telegram).
 */
export function initTelegramRuntime(options?: {
  forceMock?: boolean | undefined;
  mockTheme?: ResolvedTheme | undefined;
  startParam?: string | undefined;
}): TelegramRuntimeState {
  const locationMock = shouldMockTelegramFromLocation();
  const shouldMock = (options?.forceMock ?? false) || locationMock.enabled;

  if (shouldMock && !isTMA()) {
    enableTelegramMockEnv({
      theme: options?.mockTheme ?? locationMock.theme ?? 'day',
      startParam: options?.startParam ?? locationMock.startParam,
    });
  }

  const detectedTma = isTMA();

  if (!detectedTma) {
    const fallbackStartParam =
      options?.startParam ??
      locationMock.startParam ??
      (typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('startapp')
        : null);

    applySafeAreaCssVariables(ZERO_INSETS, ZERO_INSETS);

    runtimeState = {
      isTma: false,
      platform: 'web',
      version: null,
      startParam: fallbackStartParam ?? null,
      deepLinkPath: parseTelegramStartParam(fallbackStartParam),
      user: null,
      isFullscreen: false,
      isFullscreenSupported: false,
      safeAreaInsets: ZERO_INSETS,
      contentSafeAreaInsets: ZERO_INSETS,
    };
    notifyRuntimeListeners();
    return runtimeState;
  }

  sdkCleanup?.();
  sdkCleanup = init();

  initData.restore();
  themeParams.mount.ifAvailable();
  miniApp.mount.ifAvailable();
  backButton.mount.ifAvailable();
  mainButton.mount.ifAvailable();
  secondaryButton.mount.ifAvailable();
  swipeBehavior.mount.ifAvailable();

  const mountResult = viewport.mount.ifAvailable();
  if (mountResult.ok) {
    void mountResult.data
      .then(() => {
        if (runtimeState.isTma) {
          syncTelegramThemeAndViewport();
        }
      })
      .catch(() => undefined);
  }
  viewport.expand.ifAvailable();

  let platform = 'tdesktop';
  let version: string | null = null;
  let launchStartParam: string | null = null;

  try {
    const launchParams = retrieveLaunchParams();
    platform = launchParams.tgWebAppPlatform;
    version = launchParams.tgWebAppVersion;
    if (typeof launchParams.tgWebAppStartParam === 'string') {
      launchStartParam = launchParams.tgWebAppStartParam;
    }
  } catch {
    // Fallback if launchParams are partially populated
  }

  const rawStartParam =
    options?.startParam ??
    initData.startParam() ??
    launchStartParam ??
    locationMock.startParam ??
    null;

  const rawUser = initData.user();
  const user: TelegramUserSummary | null = rawUser
    ? {
        id: rawUser.id,
        firstName: rawUser.first_name,
        lastName: rawUser.last_name,
        username: rawUser.username,
        languageCode: rawUser.language_code,
      }
    : null;

  runtimeState = {
    isTma: true,
    platform,
    version,
    startParam: rawStartParam,
    deepLinkPath: parseTelegramStartParam(rawStartParam),
    user,
    isFullscreen: viewport.isFullscreen(),
    isFullscreenSupported: viewport.requestFullscreen.isSupported(),
    safeAreaInsets: viewport.safeAreaInsets(),
    contentSafeAreaInsets: viewport.contentSafeAreaInsets(),
  };

  syncTelegramThemeAndViewport();
  miniApp.ready.ifAvailable();
  notifyRuntimeListeners();

  return runtimeState;
}

export function resetTelegramRuntimeForTests(): void {
  if (runtimeState.isTma) {
    backButton.unmount();
    mainButton.unmount();
    secondaryButton.unmount();
    themeParams.unmount();
    miniApp.unmount();
    swipeBehavior.unmount();
  }
  sdkCleanup?.();
  sdkCleanup = null;
  mockMemoryStorage.clear();
  try {
    window.sessionStorage.clear();
  } catch {
    // Ignore sessionStorage errors
  }
  deepLinkConsumed = false;
  runtimeState = {
    isTma: false,
    platform: 'web',
    version: null,
    startParam: null,
    deepLinkPath: null,
    user: null,
    isFullscreen: false,
    isFullscreenSupported: false,
    safeAreaInsets: ZERO_INSETS,
    contentSafeAreaInsets: ZERO_INSETS,
  };
  notifyRuntimeListeners();
}

export function triggerTelegramHaptic(kind: TelegramHapticKind): boolean {
  if (!runtimeState.isTma) {
    return false;
  }

  switch (kind) {
    case 'save':
    case 'visit':
    case 'success': {
      const res = hapticFeedback.notificationOccurred.ifAvailable('success');
      return res.ok;
    }
    case 'error': {
      const res = hapticFeedback.notificationOccurred.ifAvailable('error');
      return res.ok;
    }
    case 'warning': {
      const res = hapticFeedback.notificationOccurred.ifAvailable('warning');
      return res.ok;
    }
    case 'vote':
    case 'select': {
      const res = hapticFeedback.selectionChanged.ifAvailable();
      return res.ok;
    }
    case 'impact': {
      const res = hapticFeedback.impactOccurred.ifAvailable('light');
      return res.ok;
    }
  }
}

export async function toggleTelegramFullscreen(): Promise<boolean> {
  if (!runtimeState.isTma) {
    return false;
  }

  if (viewport.isFullscreen()) {
    const res = viewport.exitFullscreen.ifAvailable();
    if (res.ok) {
      await res.data;
    }
  } else {
    const res = viewport.requestFullscreen.ifAvailable();
    if (res.ok) {
      await res.data;
    }
  }

  runtimeState = {
    ...runtimeState,
    isFullscreen: viewport.isFullscreen(),
  };
  notifyRuntimeListeners();
  return runtimeState.isFullscreen;
}

export function setTelegramVerticalSwipeLocked(locked: boolean): boolean {
  if (!runtimeState.isTma) {
    return false;
  }

  if (locked) {
    return swipeBehavior.disableVertical.ifAvailable().ok;
  }
  return swipeBehavior.enableVertical.ifAvailable().ok;
}

export function configureTelegramMainButton(config: {
  text: string;
  isVisible: boolean;
  isEnabled?: boolean | undefined;
  isLoading?: boolean | undefined;
  bgColor?: `#${string}` | undefined;
  textColor?: `#${string}` | undefined;
}): boolean {
  if (!runtimeState.isTma || !mainButton.setParams.isAvailable()) {
    return false;
  }

  mainButton.setParams({
    text: config.text,
    isVisible: config.isVisible,
    isEnabled: config.isEnabled ?? true,
    isLoaderVisible: config.isLoading ?? false,
    bgColor: config.bgColor ?? '#ff4a1c',
    textColor: config.textColor ?? '#17140f',
    hasShineEffect: false,
  });
  return true;
}

export function configureTelegramSecondaryButton(config: {
  text: string;
  isVisible: boolean;
  isEnabled?: boolean | undefined;
  isLoading?: boolean | undefined;
  position?: SecondaryButtonPosition | undefined;
  bgColor?: `#${string}` | undefined;
  textColor?: `#${string}` | undefined;
}): boolean {
  if (!runtimeState.isTma || !secondaryButton.setParams.isAvailable()) {
    return false;
  }

  secondaryButton.setParams({
    text: config.text,
    isVisible: config.isVisible,
    isEnabled: config.isEnabled ?? true,
    isLoaderVisible: config.isLoading ?? false,
    position: config.position ?? 'left',
    bgColor: config.bgColor ?? '#fffdf8',
    textColor: config.textColor ?? '#17140f',
    hasShineEffect: false,
  });
  return true;
}

/**
 * Единое хранилище для сессии и черновиков:
 * в TMA использует `DeviceStorage` (v9.0+) или `CloudStorage` (v6.9+) с зеркалированием в `localStorage`.
 */
export const telegramStorage = {
  async getItem(key: string): Promise<string | null> {
    let localValue: string | null = null;
    try {
      localValue = window.localStorage.getItem(key);
    } catch {
      // Ignore storage access errors
    }

    if (!runtimeState.isTma) {
      return localValue;
    }

    const deviceResult = deviceStorage.getItem.ifAvailable(key);
    if (deviceResult.ok) {
      try {
        const value = await deviceResult.data;
        if (value !== null && value !== '') {
          try {
            window.localStorage.setItem(key, value);
          } catch {
            // Ignore localStorage mirror error
          }
          return value;
        }
      } catch {
        // Fallback to CloudStorage / localStorage
      }
    }

    const cloudResult = cloudStorage.getItem.ifAvailable(key);
    if (cloudResult.ok) {
      try {
        const value = await cloudResult.data;
        if (value) {
          try {
            window.localStorage.setItem(key, value);
          } catch {
            // Ignore localStorage mirror error
          }
          return value;
        }
      } catch {
        // Fallback to localStorage
      }
    }

    return localValue;
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Ignore storage write errors
    }

    if (!runtimeState.isTma) {
      return;
    }

    const deviceResult = deviceStorage.setItem.ifAvailable(key, value);
    if (deviceResult.ok) {
      try {
        await deviceResult.data;
        return;
      } catch {
        // Fallback to CloudStorage
      }
    }

    const cloudResult = cloudStorage.setItem.ifAvailable(key, value);
    if (cloudResult.ok) {
      try {
        await cloudResult.data;
      } catch {
        // Ignore cloud sync errors
      }
    }
  },

  async deleteItem(key: string): Promise<void> {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Ignore storage remove errors
    }

    if (!runtimeState.isTma) {
      return;
    }

    const deviceResult = deviceStorage.deleteItem.ifAvailable(key);
    if (deviceResult.ok) {
      try {
        await deviceResult.data;
        return;
      } catch {
        // Fallback to CloudStorage
      }
    }

    const cloudResult = cloudStorage.deleteItem.ifAvailable(key);
    if (cloudResult.ok) {
      try {
        await cloudResult.data;
      } catch {
        // Ignore cloud delete errors
      }
    }
  },
};

export function openExternalUrl(url: string): void {
  if (runtimeState.isTma && openLink.isAvailable()) {
    openLink(url, { tryInstantView: false });
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}

export function shareViaTelegramInlineQuery(
  query: string,
  chatTypes: SwitchInlineQueryChatType[] = ['users', 'groups', 'channels'],
): boolean {
  if (!runtimeState.isTma) {
    return false;
  }

  const res = switchInlineQuery.ifAvailable(query.slice(0, 256), chatTypes);
  return res.ok;
}

export async function shareShortlistViaTelegram(
  params: ShareShortlistTelegramParams,
): Promise<ShareShortlistResult> {
  const placesPreview =
    params.places && params.places.length > 0 ? ` (${params.places.slice(0, 4).join(' · ')})` : '';
  const shareText = `${params.title}${placesPreview} — голосуй без VPN и регистрации`;

  if (runtimeState.isTma && params.preparedMessageId && shareMessage.isAvailable()) {
    try {
      await shareMessage(params.preparedMessageId);
      return 'shared_message';
    } catch {
      // Fallback to shareURL if prepared message fails
    }
  }

  if (runtimeState.isTma && shareURL.isAvailable()) {
    shareURL(params.url, shareText);
    return 'telegram_url';
  }

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: params.title,
        text: shareText,
        url: params.url,
      });
      return 'web_share';
    } catch {
      // Fallback to clipboard copy
    }
  }

  if (typeof navigator !== 'undefined' && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(params.url);
      return 'copied';
    } catch {
      return 'failed';
    }
  }

  return 'failed';
}

export function isAddToHomeScreenSupported(): boolean {
  return runtimeState.isTma && addToHomeScreen.isAvailable();
}

export function promptAddToHomeScreen(): boolean {
  if (!runtimeState.isTma) {
    return false;
  }
  const res = addToHomeScreen.ifAvailable();
  return res.ok;
}

export async function getHomeScreenStatus(): Promise<HomeScreenStatus> {
  if (!runtimeState.isTma) {
    return 'unsupported';
  }
  const res = checkHomeScreenStatus.ifAvailable();
  if (!res.ok) {
    return 'unsupported';
  }
  try {
    return await res.data;
  } catch {
    return 'unsupported';
  }
}
