import { useEffect } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';

import { YesterdayCheckModal } from '@/features/yesterday-check';
import { consumeInitialTelegramDeepLink, useTelegramRuntime } from '@/shared/telegram';
import { BottomNav, shouldShowBottomNav } from '@/widgets/bottom-nav';

export function AppLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const runtime = useTelegramRuntime();
  const showBottomNav = shouldShowBottomNav(pathname);

  useEffect(() => {
    const deepLink = consumeInitialTelegramDeepLink();
    if (deepLink && deepLink !== pathname) {
      void navigate(deepLink, { replace: true });
    }
  }, [navigate, pathname]);

  return (
    <div
      data-tma={runtime.isTma ? 'true' : 'false'}
      style={
        runtime.isTma
          ? {
              paddingTop: 'var(--tg-content-safe-area-inset-top, 0px)',
            }
          : undefined
      }
      className={showBottomNav ? 'min-h-dvh pb-[76px]' : 'min-h-dvh'}
    >
      <Outlet />
      {showBottomNav && <YesterdayCheckModal />}
      {showBottomNav && <BottomNav />}
    </div>
  );
}
