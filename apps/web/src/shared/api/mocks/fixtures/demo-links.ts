export const DEMO_RECOGNIZED_LINK = 'https://www.instagram.com/reel/hype-coffee/';
export const DEMO_UNKNOWN_LINK = 'https://www.instagram.com/reel/unknown-place/';

export const DEMO_COFFEE_LINK = DEMO_RECOGNIZED_LINK;
export const DEMO_UNRECOGNIZED_LINK = DEMO_UNKNOWN_LINK;

export const DEMO_LINKS = {
  recognized: DEMO_RECOGNIZED_LINK,
  unknown: DEMO_UNKNOWN_LINK,
  coffee: DEMO_RECOGNIZED_LINK,
  unrecognized: DEMO_UNKNOWN_LINK,
} as const;

export const demoLinks = [
  {
    id: 'coffee',
    label: 'Пример: кофейня',
    url: DEMO_RECOGNIZED_LINK,
  },
  {
    id: 'unknown',
    label: 'Пример: не распознаётся',
    url: DEMO_UNKNOWN_LINK,
  },
] as const;
