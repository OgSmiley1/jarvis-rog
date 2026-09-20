const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

// React Native resolves platform-specific files (Foo.native.ts, Foo.android.ts,
// Foo.web.ts) from a suffix-free import. Metro and `tsconfig.moduleSuffixes`
// both know this; the ESLint import resolver does not unless told, which is why
// `@/hooks/useLiveVoice` and `@/components/PuterGateway` read as unresolved.
const platformExtensions = [
  '.native.ts',
  '.native.tsx',
  '.android.ts',
  '.android.tsx',
  '.ios.ts',
  '.ios.tsx',
  '.web.ts',
  '.web.tsx',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.json',
];

module.exports = defineConfig([
  expoConfig,
  {
    settings: {
      'import/resolver': {
        typescript: {
          project: './tsconfig.json',
          extensions: platformExtensions,
        },
        node: {
          extensions: platformExtensions,
        },
      },
    },
  },
  {
    ignores: ['android/**', 'ios/**', 'node_modules/**', 'coverage/**'],
  },
]);
