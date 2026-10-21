import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

// Flat config. Runs the non-type-checked recommended rules (fast, no project
// service needed); `prettier` disables stylistic rules so formatting is Prettier's job.
export default tseslint.config(
  { ignores: ["dist/", "node_modules/"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", ignoreRestSiblings: true },
      ],
      // Allow `declare global { namespace Express { ... } }` — the standard way to augment Express types.
      "@typescript-eslint/no-namespace": ["error", { allowDeclarations: true }],
    },
  },
);
