/**
 * Live-network integration test — skipped by default in CI.
 *
 * Opt in locally:
 *   RUN_LIVE_API_TESTS=1 npm test -- fluent-api.test.ts
 */
const runLiveApiTests = process.env.RUN_LIVE_API_TESTS === '1';

(runLiveApiTests ? describe : describe.skip)(
  'Fluent API Integration (live)',
  () => {
    const TEST_CONFIG = {
      baseUrl: 'https://dev.api.fluent.bible',
      endpoint: '/languages',
    };

    it('demonstrates a successful connection to the Fluent API', async () => {
      console.log('Starting Fluent API Integration Test...');

      const response = await fetch(
        `${TEST_CONFIG.baseUrl}${TEST_CONFIG.endpoint}`,
        {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        },
      );

      if (response.status === 403) {
        console.log('TEST SUCCESSFUL: Server reached (403 Forbidden)');
        expect(response.status).toBe(403);
        return;
      }

      if (response.ok) {
        const data = await response.json();
        console.log('TEST SUCCESSFUL: Data received!');
        console.log(
          'Sample Data:',
          data?.[1]?.langName || 'No languages found',
        );
        expect(response.status).toBe(200);
        return;
      }

      throw new Error(`Unexpected response status: ${response.status}`);
    });
  },
);

export const runApiIntegrationTest = async () => {};
