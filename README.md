# Grootboek

[![CI](https://github.com/juampilorenzo/grootboek/actions/workflows/ci.yml/badge.svg)](https://github.com/juampilorenzo/grootboek/actions/workflows/ci.yml)

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

### File Adapter (Simplest - No Git)

For reading/writing journal files without Git integration:

```typescript
import { createFileLedgerService } from 'grootboek/adapters/file'

// Node.js
const ledger = createFileLedgerService({
  journalPath: './my.journal'
})

const transactions = await ledger.listTransactions()
const balances = await ledger.getBalances()
```

#### Browser Usage

```typescript
import { createFileLedgerService, InMemoryFileProvider } from 'grootboek/adapters/file'

// In-memory (no persistence)
const ledger = createFileLedgerService({
  journalPath: 'ledger.journal',
  fileProvider: new InMemoryFileProvider()
})

// Or with localStorage
const localStorageProvider = {
  read: async (path) => localStorage.getItem(path) ?? '',
  write: async (path, content) => localStorage.setItem(path, content),
  stat: async (path) => localStorage.getItem(path) ? { lastModified: new Date() } : null
}

const ledger = createFileLedgerService({
  journalPath: 'myLedger',
  fileProvider: localStorageProvider
})
```

### Git Adapter (Journal Files + Git Commits)

For journal files with automatic Git commits:

```typescript
import { createGitLedgerService } from 'grootboek/adapters/git'

const ledger = createGitLedgerService({
  journalPath: './my.journal',
  autoCommit: true  // Commits after each write
})

const transactions = await ledger.listTransactions()
const balances = await ledger.getBalances()
```

### Postgres Adapter

```typescript
import { Pool } from 'pg'
import { createPostgresLedgerService, runMigrations } from 'grootboek/adapters/postgres'

const pool = new Pool({
  connectionString: 'postgresql://...'
})

// Run migrations (creates tables with default names)
await runMigrations(pool)

// Create service
const ledger = createPostgresLedgerService({ pool })
```

#### Custom Table Names (Avoid Conflicts)

If your app already has tables like `transactions` or `accounts`, use a prefix:

```typescript
import { createPostgresLedgerService, runMigrations, generateSchema, createTableNames } from 'grootboek/adapters/postgres'

// Option 1: Use a table prefix
const tableConfig = { prefix: 'ledger_' }

await runMigrations(pool, tableConfig)
const ledger = createPostgresLedgerService({ pool, tables: tableConfig })
// Creates: ledger_transactions, ledger_accounts, ledger_postings, etc.

// Option 2: Custom table names
const tableConfig = {
  tables: {
    transactions: 'finance_txns',
    accounts: 'finance_accounts',
    postings: 'finance_postings',
    commodities: 'finance_commodities',
    prices: 'finance_prices'
  }
}
```

#### Bring Your Own Migrations

If you use Prisma, Knex, or another migration tool, get the SQL schema instead:

```typescript
import { generateSchema, createTableNames } from 'grootboek/adapters/postgres'

// Generate SQL for your migration file
const tables = createTableNames({ prefix: 'ledger_' })
const sql = generateSchema(tables)

console.log(sql)
// Use this SQL in your own migration system
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
│   │   ├── file/       # Simple file adapter (Node.js/browser)
│   │   ├── git/        # Journal file + Git commits
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
