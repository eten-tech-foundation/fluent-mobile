import { APP_HOME_HREF } from './authGate';
import { homeHrefFor } from './uiVersionRoutes';

describe('homeHrefFor', () => {
  it('sends Next to v2 Home and Legacy to the Legacy stack', () => {
    expect(homeHrefFor('next')).toBe('/v2');
    expect(homeHrefFor('legacy')).toBe(APP_HOME_HREF);
  });
});
