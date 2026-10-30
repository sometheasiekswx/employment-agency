import { defineConfig, globalIgnores } from "eslint/config";
import js from "@eslint/js";
import ts from "typescript-eslint";
import hooks from "eslint-plugin-react-hooks";
import next from "@next/eslint-plugin-next";
import globals from "globals";

export default defineConfig([
  globalIgnores([".next/**", "out/**", "next-env.d.ts"]),
  js.configs.recommended,
  ...ts.configs.recommended,
  hooks.configs.flat.recommended,
  next.configs.recommended,
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
]);
