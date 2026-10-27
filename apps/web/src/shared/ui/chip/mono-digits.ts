import { createElement, Fragment, type ReactNode } from 'react';

const DIGIT_TOKEN_REGEX = /(\d+(?:[.,:]\d+)*)/g;

export function renderWithMonoDigits(content: ReactNode): ReactNode {
  if (typeof content === 'number') {
    return createElement('span', { className: 'font-mono' }, content);
  }
  if (typeof content !== 'string') {
    return content;
  }
  if (!/\d/.test(content)) {
    return content;
  }

  const parts = content.split(DIGIT_TOKEN_REGEX);
  return parts.map((part, idx) =>
    idx % 2 === 1
      ? createElement('span', { key: idx, className: 'font-mono text-[0.93em]' }, part)
      : createElement(Fragment, { key: idx }, part),
  );
}
