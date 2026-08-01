const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/**', 'portal.db'] },

  js.configs.recommended,

  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node }
    },
    rules: {
      // Express error handlers are identified by arity, so the trailing `next`
      // must stay even when unused. Same for a caught error that is deliberately
      // swallowed.
      'no-unused-vars': ['error', {
        argsIgnorePattern: '^(next|_)',
        caughtErrors: 'none',
        varsIgnorePattern: '^_'
      }],
      'no-control-regex': 'error'
    }
  }
];
