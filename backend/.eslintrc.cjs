module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: ['./tsconfig.lint.json', './tsconfig.json', './tsconfig.spec.json', './tsconfig.e2e.json'],
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint', 'import'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  env: {
    node: true,
    es2022: true,
  },
  ignorePatterns: [
    'dist/**',
    'node_modules/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
    '*.d.ts',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unsafe-assignment': 'warn',
    '@typescript-eslint/no-unsafe-member-access': 'warn',
    '@typescript-eslint/no-unsafe-call': 'warn',
    '@typescript-eslint/no-unsafe-return': 'warn',
    '@typescript-eslint/no-unsafe-argument': 'warn',
    '@typescript-eslint/restrict-template-expressions': 'warn',
    '@typescript-eslint/no-floating-promises': 'warn',
    'no-console': 'error',
    'import/order': ['warn', { 'newlines-between': 'always' }],
  },
  overrides: [
    {
      files: ['src/**/*.ts'],
      rules: {
        'no-console': 'error',
      },
    },
    {
      files: ['test/**/*.ts', 'e2e/**/*.ts', 'src/test/**/*.ts', '**/*.spec.ts', '**/*.mock.ts'],
      rules: {
        'no-console': ['error', { allow: ['warn', 'error'] }],
        '@typescript-eslint/no-empty-function': [
          'error',
          { allow: ['arrowFunctions', 'methods', 'functions'] },
        ],
      },
    },
    {
      files: ['seeds/**/*.ts', '*.config.ts', 'drizzle.config.ts'],
      rules: {
        'no-console': 'off',
      },
    },
  ],
};
