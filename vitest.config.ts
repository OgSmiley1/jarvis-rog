import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = dirname(fileURLToPath(import.meta.url));
const here = (p: string) => resolve(rootDir, p);

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/stubs/**'],
    globals: true,
  },
  resolve: {
    alias: [
      // React Native and several Expo entry points are Flow-typed or native-only,
      // so they cannot be parsed or executed under plain Node. These aliases apply
      // to the test run only -- Metro bundles the real modules into the APK.
      { find: /^react-native$/, replacement: here('./tests/stubs/react-native.ts') },
      { find: /^expo-speech$/, replacement: here('./tests/stubs/expo-speech.ts') },
      { find: /^expo-secure-store$/, replacement: here('./tests/stubs/expo-secure-store.ts') },
      { find: '@', replacement: here('./') },
    ],
  },
});
