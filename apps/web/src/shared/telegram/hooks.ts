import {
  backButton,
  mainButton,
  secondaryButton,
  type SecondaryButtonPosition,
} from '@tma.js/sdk-react';
import { useEffect, useRef, useSyncExternalStore } from 'react';

import {
  configureTelegramMainButton,
  configureTelegramSecondaryButton,
  getTelegramRuntimeState,
  setTelegramVerticalSwipeLocked,
  subscribeTelegramRuntime,
  type TelegramRuntimeState,
  toggleTelegramFullscreen,
} from './telegram';

export interface TelegramBottomButtonConfig {
  text: string;
  onClick: () => void;
  isVisible?: boolean | undefined;
  isEnabled?: boolean | undefined;
  isLoading?: boolean | undefined;
  bgColor?: `#${string}` | undefined;
  textColor?: `#${string}` | undefined;
}

export interface TelegramSecondaryButtonConfig extends TelegramBottomButtonConfig {
  position?: SecondaryButtonPosition | undefined;
}

export function useTelegramRuntime(): TelegramRuntimeState {
  return useSyncExternalStore(
    subscribeTelegramRuntime,
    getTelegramRuntimeState,
    getTelegramRuntimeState,
  );
}

/**
 * Показывает системную кнопку «Назад» в шапке Telegram Mini App
 * и скрывает её при размонтировании экрана.
 */
export function useTelegramBackButton(
  onBack: () => void,
  enabled = true,
): { isNativeBackVisible: boolean } {
  const runtime = useTelegramRuntime();
  const callbackRef = useRef(onBack);

  useEffect(() => {
    callbackRef.current = onBack;
  }, [onBack]);

  useEffect(() => {
    if (!runtime.isTma || !enabled) {
      return;
    }

    backButton.show.ifAvailable();
    const offResult = backButton.onClick.ifAvailable(() => {
      callbackRef.current();
    });

    return () => {
      if (offResult.ok) {
        offResult.data();
      }
      backButton.hide.ifAvailable();
    };
  }, [enabled, runtime.isTma]);

  return {
    isNativeBackVisible: runtime.isTma && enabled && backButton.show.isAvailable(),
  };
}

/**
 * Управляет нативной главной кнопкой Telegram (`MainButton` / `BottomButton`).
 */
export function useTelegramMainButton(config: TelegramBottomButtonConfig): {
  isNativeMainButtonVisible: boolean;
} {
  const runtime = useTelegramRuntime();
  const callbackRef = useRef(config.onClick);
  const isVisible = config.isVisible ?? true;
  const isEnabled = config.isEnabled ?? true;
  const isLoading = config.isLoading ?? false;

  useEffect(() => {
    callbackRef.current = config.onClick;
  }, [config.onClick]);

  useEffect(() => {
    if (!runtime.isTma || !isVisible) {
      return;
    }

    configureTelegramMainButton({
      text: config.text,
      isVisible: true,
      isEnabled,
      isLoading,
      bgColor: config.bgColor,
      textColor: config.textColor,
    });

    const offResult = mainButton.onClick.ifAvailable(() => {
      callbackRef.current();
    });

    return () => {
      if (offResult.ok) {
        offResult.data();
      }
      mainButton.hide.ifAvailable();
    };
  }, [
    config.bgColor,
    config.text,
    config.textColor,
    isEnabled,
    isLoading,
    isVisible,
    runtime.isTma,
  ]);

  return {
    isNativeMainButtonVisible: runtime.isTma && isVisible && mainButton.setParams.isAvailable(),
  };
}

/**
 * Управляет нативной вторичной нижней кнопкой Telegram (`SecondaryButton`).
 */
export function useTelegramSecondaryButton(config: TelegramSecondaryButtonConfig): {
  isNativeSecondaryButtonVisible: boolean;
} {
  const runtime = useTelegramRuntime();
  const callbackRef = useRef(config.onClick);
  const isVisible = config.isVisible ?? true;
  const isEnabled = config.isEnabled ?? true;
  const isLoading = config.isLoading ?? false;

  useEffect(() => {
    callbackRef.current = config.onClick;
  }, [config.onClick]);

  useEffect(() => {
    if (!runtime.isTma || !isVisible) {
      return;
    }

    configureTelegramSecondaryButton({
      text: config.text,
      isVisible: true,
      isEnabled,
      isLoading,
      position: config.position,
      bgColor: config.bgColor,
      textColor: config.textColor,
    });

    const offResult = secondaryButton.onClick.ifAvailable(() => {
      callbackRef.current();
    });

    return () => {
      if (offResult.ok) {
        offResult.data();
      }
      secondaryButton.hide.ifAvailable();
    };
  }, [
    config.bgColor,
    config.position,
    config.text,
    config.textColor,
    isEnabled,
    isLoading,
    isVisible,
    runtime.isTma,
  ]);

  return {
    isNativeSecondaryButtonVisible:
      runtime.isTma && isVisible && secondaryButton.setParams.isAvailable(),
  };
}

/**
 * Запрещает закрытие Mini App вертикальным свайпом (`swipeBehavior.disableVertical`)
 * на экране с картой и выдвижной шторкой.
 */
export function useTelegramSwipeLock(locked = true): void {
  const runtime = useTelegramRuntime();

  useEffect(() => {
    if (!runtime.isTma || !locked) {
      return;
    }

    setTelegramVerticalSwipeLocked(true);

    return () => {
      setTelegramVerticalSwipeLocked(false);
    };
  }, [locked, runtime.isTma]);
}

export function useTelegramFullscreen(): {
  isSupported: boolean;
  isFullscreen: boolean;
  toggleFullscreen: () => Promise<boolean>;
} {
  const runtime = useTelegramRuntime();

  return {
    isSupported: runtime.isTma && runtime.isFullscreenSupported,
    isFullscreen: runtime.isFullscreen,
    toggleFullscreen: toggleTelegramFullscreen,
  };
}
