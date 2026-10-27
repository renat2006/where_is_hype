import { Outlet, useLocation } from 'react-router';

import { BottomNav, shouldShowBottomNav } from '@/widgets/bottom-nav';

export function AppLayout() {
  const { pathname } = useLocation();
  const showBottomNav = shouldShowBottomNav(pathname);

  return (
    <div className={showBottomNav ? 'min-h-dvh pb-[76px]' : 'min-h-dvh'}>
      <Outlet />
      {showBottomNav && <BottomNav eveningCount={0} />}
    </div>
  );
}
