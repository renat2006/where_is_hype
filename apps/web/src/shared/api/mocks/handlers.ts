import { http, HttpResponse } from 'msw';

import { placesFixture } from './fixtures';

export const handlers = [http.get('*/places', () => HttpResponse.json(placesFixture))];
