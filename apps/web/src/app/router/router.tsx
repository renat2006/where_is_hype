import { createBrowserRouter, type RouteObject } from 'react-router';

import { RequireSession } from '@/features/start-session';
import { AddPlacePage } from '@/pages/add-place';
import { EveningPage } from '@/pages/evening';
import { FriendVotePage } from '@/pages/friend-vote';
import { MyPlacesPage } from '@/pages/my-places';
import { NotFoundPage } from '@/pages/not-found';
import { PlacePage } from '@/pages/place';
import { SettingsPage } from '@/pages/settings';
import { UiKitPage } from '@/pages/ui-kit';
import { WelcomePage } from '@/pages/welcome';

import { AppLayout } from './app-layout';

export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      {
        path: '/',
        element: (
          <RequireSession>
            <MyPlacesPage />
          </RequireSession>
        ),
      },
      { path: '/welcome', element: <WelcomePage /> },
      { path: '/add', element: <AddPlacePage /> },
      { path: '/place/:id', element: <PlacePage /> },
      { path: '/evening', element: <EveningPage /> },
      { path: '/s/:token', element: <FriendVotePage /> },
      { path: '/settings', element: <SettingsPage /> },
      { path: '/ui-kit', element: <UiKitPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
