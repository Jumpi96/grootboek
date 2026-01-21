export interface TableNames {
  commodities: string
  accounts: string
  transactions: string
  postings: string
  prices: string
  schemaMigrations: string
}

export interface TableConfigOptions {
  /**
   * Prefix for all table names (e.g., 'ledger_' -> 'ledger_transactions')
   */
  prefix?: string

  /**
   * Custom table names (overrides prefix for specific tables)
   */
  tables?: Partial<TableNames>
}

const DEFAULT_TABLES: TableNames = {
  commodities: 'commodities',
  accounts: 'accounts',
  transactions: 'transactions',
  postings: 'postings',
  prices: 'prices',
  schemaMigrations: 'schema_migrations'
}

export function createTableNames(options: TableConfigOptions = {}): TableNames {
  const prefix = options.prefix ?? ''

  return {
    commodities: options.tables?.commodities ?? `${prefix}${DEFAULT_TABLES.commodities}`,
    accounts: options.tables?.accounts ?? `${prefix}${DEFAULT_TABLES.accounts}`,
    transactions: options.tables?.transactions ?? `${prefix}${DEFAULT_TABLES.transactions}`,
    postings: options.tables?.postings ?? `${prefix}${DEFAULT_TABLES.postings}`,
    prices: options.tables?.prices ?? `${prefix}${DEFAULT_TABLES.prices}`,
    schemaMigrations: options.tables?.schemaMigrations ?? `${prefix}${DEFAULT_TABLES.schemaMigrations}`
  }
}

/**
 * Generate the SQL schema for grootboek tables.
 * Use this to integrate into your own migration system.
 */
export function generateSchema(tables: TableNames): string {
  return `
-- Grootboek Ledger Schema
-- Generated table names can be customized via TableConfigOptions

-- Commodities table
CREATE TABLE IF NOT EXISTS ${tables.commodities} (
    symbol VARCHAR(32) PRIMARY KEY,
    type VARCHAR(16) NOT NULL CHECK (type IN ('fiat', 'crypto', 'stock', 'fund', 'bond')),
    precision INTEGER NOT NULL DEFAULT 2,
    name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Accounts table
CREATE TABLE IF NOT EXISTS ${tables.accounts} (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(512) UNIQUE NOT NULL,
    kind VARCHAR(16) NOT NULL CHECK (kind IN ('asset', 'liability', 'equity', 'income', 'expense')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_${tables.accounts}_kind ON ${tables.accounts}(kind);
CREATE INDEX IF NOT EXISTS idx_${tables.accounts}_full_name ON ${tables.accounts}(full_name);

-- Transactions table
CREATE TABLE IF NOT EXISTS ${tables.transactions} (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    description VARCHAR(1024) NOT NULL,
    comment TEXT,
    external_id VARCHAR(255) UNIQUE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_${tables.transactions}_date ON ${tables.transactions}(date);
CREATE INDEX IF NOT EXISTS idx_${tables.transactions}_external_id ON ${tables.transactions}(external_id);

-- Postings table
CREATE TABLE IF NOT EXISTS ${tables.postings} (
    id SERIAL PRIMARY KEY,
    transaction_id UUID NOT NULL REFERENCES ${tables.transactions}(id) ON DELETE CASCADE,
    account_id INTEGER NOT NULL REFERENCES ${tables.accounts}(id),
    quantity NUMERIC(30, 10) NOT NULL,
    commodity_symbol VARCHAR(32) NOT NULL REFERENCES ${tables.commodities}(symbol),
    comment TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_${tables.postings}_transaction_id ON ${tables.postings}(transaction_id);
CREATE INDEX IF NOT EXISTS idx_${tables.postings}_account_id ON ${tables.postings}(account_id);
CREATE INDEX IF NOT EXISTS idx_${tables.postings}_commodity_symbol ON ${tables.postings}(commodity_symbol);

-- Prices table
CREATE TABLE IF NOT EXISTS ${tables.prices} (
    date DATE NOT NULL,
    base_symbol VARCHAR(32) NOT NULL REFERENCES ${tables.commodities}(symbol),
    quote_symbol VARCHAR(32) NOT NULL REFERENCES ${tables.commodities}(symbol),
    price NUMERIC(30, 10) NOT NULL,
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (date, base_symbol, quote_symbol)
);

CREATE INDEX IF NOT EXISTS idx_${tables.prices}_base_symbol ON ${tables.prices}(base_symbol);
CREATE INDEX IF NOT EXISTS idx_${tables.prices}_quote_symbol ON ${tables.prices}(quote_symbol);
`.trim()
}
