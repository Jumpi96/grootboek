-- Initial schema for grootboek ledger

-- Commodities table
CREATE TABLE IF NOT EXISTS commodities (
    symbol VARCHAR(32) PRIMARY KEY,
    type VARCHAR(16) NOT NULL CHECK (type IN ('fiat', 'crypto', 'stock', 'fund', 'bond')),
    precision INTEGER NOT NULL DEFAULT 2,
    name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Accounts table
CREATE TABLE IF NOT EXISTS accounts (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(512) UNIQUE NOT NULL,
    kind VARCHAR(16) NOT NULL CHECK (kind IN ('asset', 'liability', 'equity', 'income', 'expense')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_accounts_kind ON accounts(kind);
CREATE INDEX IF NOT EXISTS idx_accounts_full_name ON accounts(full_name);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    description VARCHAR(1024) NOT NULL,
    comment TEXT,
    external_id VARCHAR(255) UNIQUE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_external_id ON transactions(external_id);

-- Postings table
CREATE TABLE IF NOT EXISTS postings (
    id SERIAL PRIMARY KEY,
    transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    quantity NUMERIC(30, 10) NOT NULL,
    commodity_symbol VARCHAR(32) NOT NULL REFERENCES commodities(symbol),
    comment TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_postings_transaction_id ON postings(transaction_id);
CREATE INDEX IF NOT EXISTS idx_postings_account_id ON postings(account_id);
CREATE INDEX IF NOT EXISTS idx_postings_commodity_symbol ON postings(commodity_symbol);

-- Prices table
CREATE TABLE IF NOT EXISTS prices (
    date DATE NOT NULL,
    base_symbol VARCHAR(32) NOT NULL REFERENCES commodities(symbol),
    quote_symbol VARCHAR(32) NOT NULL REFERENCES commodities(symbol),
    price NUMERIC(30, 10) NOT NULL,
    comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (date, base_symbol, quote_symbol)
);

CREATE INDEX IF NOT EXISTS idx_prices_base_symbol ON prices(base_symbol);
CREATE INDEX IF NOT EXISTS idx_prices_quote_symbol ON prices(quote_symbol);

-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO schema_migrations (version) VALUES (1) ON CONFLICT DO NOTHING;
