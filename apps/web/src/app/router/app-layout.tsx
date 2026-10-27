import { Outlet, useLocation } from 'react-router';

import { YesterdayCheckModal } from '@/features/yesterday-check';
import { BottomNav, shouldShowBottomNav } from '@/widgets/bottom-nav';

export function AppLayout() {
  const { pathname } = useLocation();
  const showBottomNav = shouldShowBottomNav(pathname);

  return (
    <div className={showBottomNav ? 'min-h-dvh pb-[76px]' : 'min-h-dvh'}>
      <Outlet />
      {showBottomNav && <YesterdayCheckModal />}
      {showBottomNav && <BottomNav />}
    </div>
  );
}
