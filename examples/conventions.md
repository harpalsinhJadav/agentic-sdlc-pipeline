# Repo conventions

- **Language:** TypeScript, `strict` on. Function components + hooks only.
- **Structure:** screens in `src/screens/`, reusable UI in `src/components/`,
  hooks in `src/hooks/`, API clients in `src/api/`, types in `src/types/`.
- **Tests:** colocated under `__tests__/` mirroring the source path; Jest +
  React Native Testing Library; filenames end in `.test.tsx` / `.test.ts`.
- **Imports:** absolute from `src/` (e.g. `import { walletApi } from "src/api/wallet"`).
- **Styling:** `StyleSheet.create`; pull values from the design tokens, never hardcode.
- **Networking:** all requests go through a typed client that returns parsed data
  or throws a typed error; components never call `fetch` directly.
- **State:** local UI state with `useState`; server state behind a custom hook.
