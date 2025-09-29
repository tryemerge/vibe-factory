const i18nCheck = process.env.LINT_I18N === 'true';

module.exports = {
  root: true,
  env: {
    browser: true,
    es2020: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
    'plugin:i18next/recommended',
    'prettier',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh', '@typescript-eslint', 'unused-imports', 'i18next'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  rules: {
    'react-refresh/only-export-components': 'off',
    'unused-imports/no-unused-imports': 'error',
    'unused-imports/no-unused-vars': [
      'error',
      {
        vars: 'all',
        args: 'after-used',
        ignoreRestSiblings: false,
      },
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
    // i18n rule - only active when LINT_I18N=true
    'i18next/no-literal-string': i18nCheck
      ? [
          'warn',
          {
            markupOnly: true,
            ignoreAttribute: [
              'data-testid',
              'to',
              'href',
              'id',
              'key',
              'type',
              'role',
              'className',
              'style',
              'aria-describedby',
            ],
          },
        ]
      : 'off',
    // Prevent direct NiceModal usage - use lib/modals wrappers instead
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: '@ebay/nice-modal-react',
            message: 'Use showModal, hideModal, registerModal from @/lib/modals instead of importing NiceModal directly.',
          },
        ],
      },
    ],
    'no-restricted-properties': [
      'error',
      {
        object: 'NiceModal',
        property: 'show',
        message: 'Use showModal from @/lib/modals instead.',
      },
      {
        object: 'NiceModal',
        property: 'hide',
        message: 'Use hideModal from @/lib/modals instead.',
      },
      {
        object: 'NiceModal',
        property: 'remove',
        message: 'Use removeModal from @/lib/modals instead.',
      },
      {
        object: 'NiceModal',
        property: 'register',
        message: 'Use registerModal from @/lib/modals instead.',
      },
    ],
  },
  overrides: [
    {
      files: ['**/*.test.{ts,tsx}', '**/*.stories.{ts,tsx}'],
      rules: {
        'i18next/no-literal-string': 'off',
      },
    },
    // Allow NiceModal imports in specific files that need them
    {
      files: [
        'src/lib/modals.ts',
        'src/main.tsx', 
        'src/App.tsx',
        'src/components/dialogs/**/*.tsx',
      ],
      rules: {
        'no-restricted-imports': 'off',
        'no-restricted-properties': 'off',
      },
    },
  ],
};
