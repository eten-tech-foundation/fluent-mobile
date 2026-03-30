/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */
// src/api/fluent-api.test.ts

const TEST_CONFIG = {
  baseUrl: 'https://dev.api.fluent.bible',
  endpoint: '/languages',
};

/**
 * Standalone test function to verify API integration.
 * Run this to confirm the app can reach the Fluent Web API.
 */
export const runApiIntegrationTest = async () => {
  console.log('🚀 Starting Fluent API Integration Test...');
  console.log(`📡 Target: ${TEST_CONFIG.baseUrl}${TEST_CONFIG.endpoint}`);

  try {
    const response = await fetch(
      `${TEST_CONFIG.baseUrl}${TEST_CONFIG.endpoint}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );

    // CRITICAL REQUIREMENT CHECK:
    // If we get a 403, it means we hit the server but lacks auth.
    // This is a "SUCCESSFUL" connection for this ticket.
    if (response.status === 403) {
      console.log('✅ TEST SUCCESSFUL: Server reached!');
      console.log('📝 Status: 403 Forbidden (Connectivity Confirmed)');
      return;
    }

    if (response.ok) {
      const data = await response.json();
      console.log('✅ TEST SUCCESSFUL: Data received!');
      console.log(
        '📦 Sample Data:',
        data?.[1]?.langName || 'No languages found',
      );
    } else {
      console.warn(
        `⚠️ Connected, but server returned status: ${response.status}`,
      );
    }
  } catch (error: any) {
    console.error('❌ TEST FAILED: Could not reach the API.');
    console.error('🔗 Error Details:', error.message);
  }
};
