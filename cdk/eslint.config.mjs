import guardian from '@guardian/eslint-config';

export default [
	...guardian.configs.recommended,
	...guardian.configs.jest,
	{
		files: ['**/*.ts'],
		rules: {
			// Newly reported after ESLint v9 / typescript-eslint v8 preset changes.
			'@typescript-eslint/consistent-type-imports': 'off',
			'import/order': 'off'
		}
	}
];