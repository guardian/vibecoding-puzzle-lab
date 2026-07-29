import baseConfig from '../../eslint.config.js';

export default [
  ...baseConfig,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    ignores: ['dist/**'],
    rules: {
      // Newly reported after ESLint v9 / typescript-eslint v8 preset changes.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-async-promise-executor': 'off',
      'no-case-declarations': 'off',
      'react-hooks/set-state-in-effect': 'off',
    },
  },
];