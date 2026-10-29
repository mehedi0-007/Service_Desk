import { appConfig } from './app.config';

describe('appConfig', () => {
  const original = process.env.SEED_ON_START;

  afterEach(() => {
    process.env.SEED_ON_START = original;
  });

  // Joi's boolean accepts "true" in any letter case, so the config must read it the same way.
  it.each(['true', 'True', 'TRUE'])('seeds on start for %s', (value) => {
    process.env.SEED_ON_START = value;
    expect(appConfig().seedOnStart).toBe(true);
  });

  it.each(['false', 'False', ''])('does not seed for %s', (value) => {
    process.env.SEED_ON_START = value;
    expect(appConfig().seedOnStart).toBe(false);
  });
});
