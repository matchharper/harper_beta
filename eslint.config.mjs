import { defineConfig } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  {
    ignores: [".next/**", ".vercel/**"],
  },
  ...nextCoreWebVitals,
  {
    plugins: {
      "react-hooks": nextCoreWebVitals[0].plugins["react-hooks"],
    },
    rules: {
      // 새 react-hooks v6 / React Compiler 규칙들은 코드베이스 점진 정리 대상.
      // FRONTEND.md §3.1 안티패턴을 surface하되 머지 차단은 하지 않는다.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
]);
