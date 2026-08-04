import eslint from "@eslint/js"
import prettier from "eslint-config-prettier"
import reactHooks from "eslint-plugin-react-hooks"
import globals from "globals"
import tseslint from "typescript-eslint"

/**
 * Generated bundles, dependency trees, reports, and Plasmo metadata are never
 * useful lint targets and may contain code outside this project's conventions.
 */
const ignoredFiles = {
  ignores: [
    ".plasmo/**",
    "build/**",
    "coverage/**",
    "node_modules/**",
    "*.zip",
    "package-lock.json",
  ],
}

/**
 * Configuration files execute in Node and should still receive ESLint's core
 * correctness checks without requiring TypeScript project information.
 */
const nodeConfiguration = {
  ...tseslint.configs.disableTypeChecked,
  files: ["**/*.{js,cjs,mjs}"],
  languageOptions: {
    ...tseslint.configs.disableTypeChecked.languageOptions,
    ecmaVersion: "latest",
    globals: globals.node,
    sourceType: "module",
  },
}

/**
 * Application and test TypeScript use type-aware rules. Browser and extension
 * globals are declared explicitly so accidental undeclared values still fail.
 */
const typedConfiguration = {
  files: ["src/**/*.{ts,tsx}", "tests/**/*.{ts,tsx}", "*.config.ts"],
  languageOptions: {
    globals: {
      ...globals.browser,
      ...globals.webextensions,
      ...globals.node,
    },
    parserOptions: {
      projectService: true,
      tsconfigRootDir: import.meta.dirname,
    },
  },
  plugins: {
    "react-hooks": reactHooks,
  },
  rules: {
    ...reactHooks.configs.recommended.rules,
    "@typescript-eslint/consistent-type-imports": [
      "error",
      {
        fixStyle: "inline-type-imports",
        prefer: "type-imports",
      },
    ],
    "@typescript-eslint/no-confusing-void-expression": [
      "error",
      {
        ignoreArrowShorthand: true,
      },
    ],
    "@typescript-eslint/no-explicit-any": "error",
    // Chromium callbacks, Zustand selectors, and React Hook Form methods are
    // intentionally passed as references; their public types do not expose a
    // meaningful `this` contract.
    "@typescript-eslint/unbound-method": "off",
    // Zod 4 keeps compatibility methods deprecated at the type level. Schema
    // migrations are handled deliberately rather than as unrelated lint debt.
    "@typescript-eslint/no-deprecated": "off",
    // Numeric identifiers and counters are safe, intentional log/UI values.
    "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    // Type-aware condition analysis produces false positives around browser
    // globals, DOM state, and values narrowed across asynchronous callbacks.
    "@typescript-eslint/no-unnecessary-condition": "off",
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/no-misused-promises": "error",
    "@typescript-eslint/prefer-nullish-coalescing": "error",
    "@typescript-eslint/prefer-optional-chain": "off",
    "@typescript-eslint/switch-exhaustiveness-check": "error",
    // These effects hydrate or reset state in response to external extension
    // storage, browser events, and dialog identities.
    "react-hooks/set-state-in-effect": "off",
    // Control characters are intentionally matched by filename sanitization.
    "no-control-regex": "off",
    "no-unused-vars": "off",
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "no-console": "error",
  },
}

/**
 * Prettier's compatibility preset is last so formatting remains Prettier's
 * responsibility and cannot conflict with correctness-oriented lint rules.
 */
export default tseslint.config(
  ignoredFiles,
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  typedConfiguration,
  nodeConfiguration,
  prettier,
)
