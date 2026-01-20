# Grootboek

A TypeScript financial ledger system with storage adapters.

## Overview

Grootboek is a library-only npm package for managing financial transactions with:

- **Core**: Domain model, validations, and calculation engine (storage-agnostic)
- **Git/Text Adapter**: Reads/writes Ledger-style journal files
- **Postgres Adapter**: Normalized relational tables

## Installation

### From GitHub

```bash
# Install from GitHub (main branch)
npm install github:juampilorenzo/grootboek

# Install a specific version/tag
npm install github:juampilorenzo/grootboek#v0.1.0
```

### From npm (if published)

```bash
npm install grootboek
```

### For Postgres support

```bash
npm install pg
```

## Usage

### Git Adapter (Journal Files)

```typescript
import { createGitLedgerService } from 'grootboek/adapters/git'

const ledger = createGitLedgerService({
  journalPath: './my.journal',
  autoCommit: false
})

// List transactions
const transactions = await ledger.listTransactions()

// Get balances
const balances = await ledger.getBalances()

// Get balance for specific accounts
const assetsBalance = await ledger.getBalance('Assets:**')

// Append new transaction
await ledger.appendTransaction(new Transaction({
  date: new Date(),
  description: 'Coffee',
  postings: [
    new Posting({
      account: new Account({ name: 'Assets:Cash' }),
      amount: new Money({ quantity: -5, commodity: '$' })
    }),
    new Posting({
      account: new Account({ name: 'Expenses:Food' }),
      amount: new Money({ quantity: 5, commodity: '$' })
    })
  ]
}))
```

### Postgres Adapter

```typescript
import { Pool } from 'pg'
import { createPostgresLedgerService, runMigrations } from 'grootboek/adapters/postgres'

const pool = new Pool({
  connectionString: 'postgresql://...'
})

// Run migrations
await runMigrations(pool)

// Create service
const ledger = createPostgresLedgerService({ pool })

// Use same API as Git adapter
const transactions = await ledger.listTransactions()
```

### Core Domain Objects

```typescript
import {
  Transaction,
  Posting,
  Account,
  Money,
  Price,
  Decimal
} from 'grootboek/core'

// Create a balanced transaction
const transaction = new Transaction({
  date: new Date('2024-01-15'),
  description: 'Grocery shopping',
  postings: [
    new Posting({
      account: new Account({ name: 'Assets:Bank:Checking' }),
      amount: new Money({ quantity: -50, commodity: '$' })
    }),
    new Posting({
      account: new Account({ name: 'Expenses:Food' }),
      amount: new Money({ quantity: 50, commodity: '$' })
    })
  ]
})

// Transaction must balance per commodity
// sum(postings for each commodity) === 0
```

## Journal Format

The Git adapter supports Ledger-style journal files:

```
2024/01/15 Grocery shopping
  Assets:Bank:Checking    $ -50.00
  Expenses:Food           $ 50.00

P 2024/01/15 ETH $ 2500.00

2024/01/16 Buy crypto
  Assets:Exchange         $ -100.00
  Income:Trading          $ 100.00
  Assets:Exchange         ETH 0.04
  Income:Trading          ETH -0.04
```

Supported features:
- Dates: `YYYY/MM/DD` or `YYYY-MM-DD`
- Amounts: `$ 78.10`, `-$ 100`, `ETH 0.123`, `"AY24" 897`
- Prices: `P 2020/07/09 ETH $ 335.33`
- Comments: `;` or `;;`

## API Reference

### LedgerService

```typescript
interface LedgerService {
  // Transactions
  listTransactions(filter?: TransactionFilter): Promise<Transaction[]>
  getTransaction(id: string): Promise<Transaction | null>
  appendTransaction(transaction: Transaction): Promise<Transaction>
  appendTransactions(transactions: Transaction[]): Promise<Transaction[]>
  existsExternalId(externalId: string): Promise<boolean>

  // Prices
  listPrices(filter?: PriceFilter): Promise<Price[]>
  getPrice(base: string, quote: string, asOf?: Date): Promise<Price | null>
  upsertPrices(prices: Price[]): Promise<void>

  // Balances
  getPositions(options?): Promise<Position[]>
  getBalances(options?): Promise<Balance[]>
  getBalance(pattern: string, options?): Promise<Balance>
  getBalanceInCommodity(pattern: string, commodity: string): Promise<Money>
}
```

### Account Patterns

Account patterns support wildcards:
- `*` matches one segment
- `**` matches any number of segments

```typescript
// Match all bank accounts
await ledger.getBalance('Assets:Bank:**')

// Match all checking accounts
await ledger.getBalance('Assets:*:Checking')
```

## Architecture

```
grootboek/
├── src/
│   ├── core/           # Domain model, ports, services
│   │   ├── domain/     # Money, Account, Transaction, etc.
│   │   ├── ports/      # Repository interfaces
│   │   └── services/   # LedgerService, BalanceCalculator
│   ├── adapters/
│   │   ├── git/        # Journal file adapter
│   │   └── postgres/   # PostgreSQL adapter
│   └── testing/        # Test builders
└── tests/
    ├── unit/           # Domain model tests
    ├── contract/       # Adapter contract tests
    └── golden/         # Format parity tests
```

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Type check
npm run typecheck

# Build
npm run build
```

## License

MIT
