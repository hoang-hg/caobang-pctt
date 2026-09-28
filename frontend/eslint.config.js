// ESLint (npm run lint, chạy trong CI): chỉ bật quy tắc bắt LỖI — biến chưa khai báo (build của Vite không báo),
// dùng hook React sai, biến / import không dùng, điều kiện luôn đúng… Không có quy tắc định dạng.
import react from 'eslint-plugin-react';
import hooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

const bugRules = {
  'no-undef': 'error',
  'no-unused-vars': ['error', { args: 'none', ignoreRestSiblings: true, varsIgnorePattern: '^_', caughtErrors: 'none' }],
  'no-dupe-keys': 'error',
  'no-duplicate-case': 'error',
  'no-unreachable': 'error',
  'no-self-assign': 'error',
  'no-self-compare': 'error',
  'no-cond-assign': 'error',
  'no-constant-condition': ['error', { checkLoops: false }],
  'no-constant-binary-expression': 'error',
  'no-unsafe-optional-chaining': 'error',
  'no-dupe-else-if': 'error',
  'no-fallthrough': 'error',
  'use-isnan': 'error',
  'valid-typeof': 'error',
  'array-callback-return': 'error',
  'no-async-promise-executor': 'error',
  'no-loss-of-precision': 'error',
  'no-sparse-arrays': 'error',
};

export default [
  { ignores: ['dist/', 'node_modules/'] },
  { linterOptions: { reportUnusedDisableDirectives: 'error' } },
  {
    files: ['src/**/*.{js,jsx}'],
    ignores: ['src/sw.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: globals.browser,
    },
    plugins: { react, 'react-hooks': hooks },
    settings: { react: { version: '18.3' } },
    rules: {
      ...bugRules,
      'react/jsx-no-undef': 'error',
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error',
      'react/jsx-key': 'error',
      'react/jsx-no-duplicate-props': 'error',
      'react/no-direct-mutation-state': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    // Service worker: không import vào ứng dụng; vite.config.js thay __PRECACHE__ lúc build
    files: ['src/sw.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'script', globals: { ...globals.serviceworker, __PRECACHE__: 'readonly' } },
    rules: bugRules,
  },
  {
    files: ['*.{js,mjs}', 'scripts/**/*.{js,mjs}'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: globals.node },
    rules: bugRules,
  },
];
