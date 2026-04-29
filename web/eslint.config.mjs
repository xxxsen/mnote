import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "coverage/**", "next-env.d.ts"]),

  // ── type-checked rules (equivalent to Go errcheck / staticcheck) ──
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    extends: [tseslint.configs.strictTypeCheckedOnly],
    languageOptions: {
      parserOptions: { projectService: true },
    },
    rules: {
      "@typescript-eslint/no-unnecessary-condition": "error",

      "@typescript-eslint/no-confusing-void-expression": ["error", {
        ignoreArrowShorthand: true,
        ignoreVoidOperator: true,
      }],
      "@typescript-eslint/no-misused-promises": ["error", {
        checksVoidReturn: { attributes: false },
      }],
      "@typescript-eslint/restrict-template-expressions": ["error", {
        allowNumber: true,
        allowBoolean: true,
      }],
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/unified-signatures": "off",
      "@typescript-eslint/no-dynamic-delete": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-invalid-void-type": "off",
    },
  },

  // ── strict rules for source files ──
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    rules: {
      "@typescript-eslint/no-shadow": "error",
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      }],
      "@typescript-eslint/consistent-type-imports": ["error", {
        prefer: "type-imports",
        fixStyle: "separate-type-imports",
      }],

      "complexity": ["error", 15],
      "max-depth": ["error", 4],
      "max-lines-per-function": ["error", { max: 200, skipBlankLines: true, skipComments: true }],
      "max-lines": ["error", { max: 500, skipBlankLines: true, skipComments: true }],
      "max-params": ["error", 5],

      "eqeqeq": ["error", "always"],
      "no-param-reassign": ["error", {
        props: true,
        ignorePropertyModificationsForRegex: ["Ref$"],
      }],
      "prefer-const": "error",
      "no-unused-expressions": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",

      "no-console": ["error", { allow: ["warn", "error", "debug"] }],

      "@next/next/no-img-element": "off",
    },
  },

  // ── relax for test files ──
  {
    files: ["src/**/__tests__/**", "src/**/*.test.ts", "src/**/*.test.tsx"],
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-unnecessary-condition": "off",
      "@typescript-eslint/no-unnecessary-type-parameters": "off",
      "@typescript-eslint/require-await": "off",
      "@typescript-eslint/no-shadow": "off",
      "@typescript-eslint/consistent-type-imports": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/no-deprecated": "off",
      "complexity": "off",
      "max-depth": "off",
      "max-lines-per-function": "off",
      "max-lines": "off",
      "max-params": "off",
      "no-console": "off",
    },
  },
]);

export default eslintConfig;
