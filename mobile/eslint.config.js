// Flat ESLint config for the Expo app. eslint-config-expo carries the React / React Native /
// import rules; eslint-config-prettier turns off stylistic rules so Prettier owns formatting.
const expoFlat = require("eslint-config-expo/flat");
const prettier = require("eslint-config-prettier");

module.exports = [
  { ignores: ["dist/*", "ios/*", "android/*", ".expo/*", "patches/*", "node_modules/*"] },
  ...expoFlat,
  prettier,
  {
    // eslint-config-expo 57 enables the React-Compiler-era react-hooks rules. These flag common,
    // correct patterns (a loading flag set in a fetch effect, reading a ref) rather than bugs, so
    // mute them. The real correctness rules — rules-of-hooks and exhaustive-deps — stay on.
    rules: {
      "react/no-unescaped-entities": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
      "@typescript-eslint/array-type": "off",
    },
  },
];
