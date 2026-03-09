import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";

export default [
  {
    files: ["**/*.ts"],
    ignores: ["node_modules/**", "dist/**"],
    languageOptions: {
      parser: tsParser,
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/libs/shared/**"],
              message: "Use @shared/* alias instead",
            },
          ],
        },
      ],
    },
  },
];
