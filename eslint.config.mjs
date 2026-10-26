import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import { defineConfig, globalIgnores } from "eslint/config";

// eslint-config-next 15 espone configurazioni in formato eslintrc: si adattano con FlatCompat.
const __dirname = dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = defineConfig([
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // Regole di stile downgradate a warning (codice ereditato dal design Figma e tipi PocketBase), per non far fallire next build.
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "react/no-unescaped-entities": "warn",
    },
  },
  // Migrazioni PocketBase JSVM: il riferimento /// <reference> ai tipi e' il pattern ufficiale.
  {
    files: ["pocketbase/**/*.js"],
    rules: {
      "@typescript-eslint/triple-slash-reference": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
