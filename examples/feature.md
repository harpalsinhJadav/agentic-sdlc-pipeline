# Feature: Wallet balance card with transaction history

Add a `Wallet` screen to the React Native app that shows the user's current
balance and a scrollable list of recent transactions.

## Requirements
- A `BalanceCard` component showing the formatted balance and a 24h delta.
- A `TransactionList` that renders transactions with merchant, amount, and date.
- Pull-to-refresh that re-fetches balance + transactions.
- Loading and error states for both the balance and the list.
- Amounts are formatted with the user's currency; negative amounts render red.

## Data
- `GET /api/wallet/balance` → `{ balance: number, currency: string, delta24h: number }`
- `GET /api/wallet/transactions?cursor` → `{ items: Transaction[], nextCursor?: string }`
  where `Transaction = { id, merchant, amount, currency, occurredAt }`

## Constraints
- TypeScript, function components, hooks only.
- Network access goes through a typed `walletApi` client.
- No business logic in components — use a `useWallet` hook.
