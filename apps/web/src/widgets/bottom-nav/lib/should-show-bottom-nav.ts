import { matchPath } from 'react-router';

export function shouldShowBottomNav(pathname: string): boolean {
  return (
    matchPath({ path: '/', end: true }, pathname) !== null ||
    matchPath({ path: '/evening', end: true }, pathname) !== null ||
    matchPath({ path: '/place/:id', end: true }, pathname) !== null
  );
}
