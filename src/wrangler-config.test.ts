import { experimental_readRawConfig as read } from 'wrangler';
import { expect, it } from 'vitest';

// The adapter builds with kit.wrangler.jsonc and wrangler deploys with wrangler.jsonc: if their
// runtime settings drift, what is tested is not what runs.
it('builds and deploys with the same runtime settings', () => {
  const runtime = (config: string) => {
    const { rawConfig } = read({ config });
    return {
      name: rawConfig.name,
      compatibility_date: rawConfig.compatibility_date,
      compatibility_flags: rawConfig.compatibility_flags,
      assets: rawConfig.assets,
    };
  };
  expect(runtime('kit.wrangler.jsonc')).toEqual(runtime('wrangler.jsonc'));
  expect(runtime('wrangler.jsonc').compatibility_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});
