// ESLint is where most of the non-negotiable rules (.claude/rules/test-integrity.md) become
// code. This file is owner-only: no agent role may write it, so no agent can relax the rules
// that judge its own work.

import js from '@eslint/js'
import { defineConfig } from 'eslint/config'
import playwright from 'eslint-plugin-playwright'
import tseslint from 'typescript-eslint'

const HEBREW = '[\\u0590-\\u05FF]'

// Rule 5: keep the automation deterministic. Nothing an LLM drives runs inside a test.
const determinismImports = {
  patterns: [
    {
      group: ['@anthropic-ai/*', 'openai', 'openai/*', '@openai/*'],
      message: 'LLM SDKs are for tools/dev-loop only. Tests and the framework stay deterministic.'
    },
    {
      group: ['**/tools/*', '**/tools/**', 'tools/*', 'tools/**'],
      message:
        'src/ and tests/ never import tools/: the gate and the driver stay outside the framework.'
    }
  ]
}

// Specs use the framework, not raw Playwright, and never skip or loosen a test.
const specRestrictedSyntax = [
  {
    selector:
      'CallExpression[callee.property.name=/^(locator|frameLocator|getByRole|getByLabel|getByPlaceholder|getByText|getByAltText|getByTitle|getByTestId|\\$|\\$\\$|\\$eval|\\$\\$eval|waitForSelector)$/]',
    message: 'Specs never locate elements. Use a page object or component from src/ui/.'
  },
  {
    selector: 'MemberExpression[object.name="request"]',
    message: 'Specs never call request.* directly. Use an API client from src/api/clients/.'
  },
  {
    selector: 'ObjectPattern > Property[key.name="request"]',
    message:
      'Specs never use the raw request fixture. Use operatorApi / employeeApi / anonymousApi.'
  },
  {
    selector: 'CallExpression[callee.property.name="waitForTimeout"]',
    message: 'No fixed sleeps. Wait for a response or use a web-first assertion.'
  },
  {
    selector: `Literal[value=/${HEBREW}/]`,
    message: 'No Hebrew text in specs. Accessible names live in src/ui/labels/<page>.he.ts.'
  },
  {
    selector: `TemplateElement[value.raw=/${HEBREW}/]`,
    message: 'No Hebrew text in specs. Accessible names live in src/ui/labels/<page>.he.ts.'
  },
  {
    selector: 'MemberExpression[object.name="test"][property.name=/^(skip|fixme|fail|only)$/]',
    message:
      'Never skip, focus, or expect-fail a test. Quarantine goes through .test/quarantine.md.'
  },
  {
    selector:
      'MemberExpression[object.object.name="test"][object.property.name="describe"][property.name=/^(skip|fixme|fail|only)$/]',
    message:
      'Never skip, focus, or expect-fail a test. Quarantine goes through .test/quarantine.md.'
  }
]

export default defineConfig(
  {
    ignores: [
      'node_modules/',
      '.orchestrate/',
      '.auth/',
      'test-results/',
      'playwright-report/',
      'allure-report/',
      'allure-results/'
    ]
  },
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.js', '.claude/hooks/*.js', '.claude/hooks/lib/*.js']
        },
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ],
      eqeqeq: ['error', 'always'],
      'no-console': 'off'
    }
  },
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly' }
    }
  },
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', determinismImports]
    }
  },
  {
    // The unit tests of the gate, the driver and the hooks (owner-only folders) test tools/
    // itself. The LLM SDK ban still holds there.
    files: ['tests/unit/gates/**/*.ts', 'tests/unit/dev-loop/**/*.ts', 'tests/unit/hooks/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: determinismImports.patterns.slice(0, 1) }]
    }
  },
  {
    files: ['tests/ui/**/*.ts', 'tests/api/**/*.ts', 'tests/e2e/**/*.ts', 'tests/setup/**/*.ts'],
    extends: [playwright.configs['flat/recommended']],
    rules: {
      'playwright/no-skipped-test': ['error', { allowConditional: false }],
      'playwright/no-focused-test': 'error',
      'playwright/no-wait-for-timeout': 'error',
      'playwright/no-wait-for-selector': 'error',
      'playwright/no-element-handle': 'error',
      'playwright/missing-playwright-await': 'error',
      'playwright/no-conditional-in-test': 'error',
      'playwright/no-conditional-expect': 'error',
      'playwright/expect-expect': [
        'error',
        {
          assertFunctionNames: ['expect', 'expect.soft', 'verifyStatus'],
          assertFunctionPatterns: ['^expect']
        }
      ]
    }
  },
  {
    files: ['tests/ui/**/*.spec.ts', 'tests/api/**/*.spec.ts', 'tests/e2e/**/*.spec.ts'],
    rules: {
      'no-restricted-syntax': ['error', ...specRestrictedSyntax],
      'no-restricted-imports': [
        'error',
        {
          ...determinismImports,
          paths: [
            {
              name: '@playwright/test',
              allowTypeImports: true,
              message:
                'Import test and expect from tests/fixtures.ts so specs get the framework fixtures and matchers.'
            }
          ]
        }
      ]
    }
  }
)
