import baseConfig from '../../eslint.config.js';
import globals from 'globals';

export default [
  ...baseConfig,
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    ignores: ['dist/**'],
    languageOptions: {
      globals: globals.node,
    },
    rules: {
      // Newly reported after ESLint v9 / typescript-eslint v8 preset changes.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'prefer-const': 'off',
    },
  },
];