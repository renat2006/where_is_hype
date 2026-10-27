import type { ReactNode } from 'react';
import { Navigate } from 'react-router';

import { hasStoredSession } from '@/entities/session';

export interface RequireSessionProps {
  children: ReactNode;
}

export function RequireSession({ children }: RequireSessionProps) {
  if (!hasStoredSession()) {
    return <Navigate to="/welcome" replace />;
  }

  return <>{children}</>;
}
