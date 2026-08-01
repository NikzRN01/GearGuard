import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  js.configs.recommended,

  // .ts/.tsx are excluded: typescript-eslint requires typescript <6.1.0 and this
  // project is on 7.x, so those files cannot be parsed here. `npm run typecheck`
  // (tsc --noEmit) covers them instead.
  { ignores: ['dist/**', 'node_modules/**', '**/*.ts', '**/*.tsx'] },

  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: { ecmaFeatures: { jsx: true } }
    },
    settings: { react: { version: 'detect' } },
    plugins: { react, 'react-hooks': reactHooks },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...reactHooks.configs.recommended.rules,

      // The JSX transform injects React itself; an explicit import is not required.
      'react/react-in-jsx-scope': 'off',
      // Prop types are not used in this codebase.
      'react/prop-types': 'off',
      // Copy contains apostrophes and quotes; escaping them hurts readability.
      'react/no-unescaped-entities': 'off',

      // "Fetch on mount" - useEffect(() => { load(); }, []) - is the idiom every
      // page in this app is built on. The React Compiler rule that forbids it
      // would fire 17 times on working code and says nothing about correctness
      // here, so it is off rather than permanently ignored at each call site.
      'react-hooks/set-state-in-effect': 'off',

      // The rules that actually catch defects here: a variable that is assigned
      // and never used is usually a leftover from an edit, and an effect with a
      // stale dependency list is a real bug rather than a style preference.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'react-hooks/exhaustive-deps': 'warn'
    }
  },

  {
    files: ['**/*.test.{js,jsx}', 'src/test/**/*.js'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } }
  },

  {
    files: ['vite.config.js', 'eslint.config.js'],
    languageOptions: { globals: { ...globals.node }, sourceType: 'module' }
  }
];
