import type { Pool } from 'pg'
import { LedgerService } from '../../core/services/ledger-service.js'
import { PostgresLedgerRepository, PostgresLedgerRepositoryOptions } from './postgres-ledger-repository.js'
import { PostgresPriceRepository, PostgresPriceRepositoryOptions } from './postgres-price-repository.js'
import { createTableNames, generateSchema, TableConfigOptions, TableNames } from './table-config.js'

export { PostgresLedgerRepository, type PostgresLedgerRepositoryOptions } from './postgres-ledger-repository.js'
export { PostgresPriceRepository, type PostgresPriceRepositoryOptions } from './postgres-price-repository.js'
export * from './mappers/transaction-mapper.js'
export * from './mappers/price-mapper.js'
export { createTableNames, generateSchema, type TableConfigOptions, type TableNames } from './table-config.js'

export interface CreatePostgresLedgerServiceOptions {
  pool: Pool
  /**
   * Table configuration - use prefix or custom table names to avoid conflicts
   * @example { prefix: 'ledger_' } // Creates ledger_transactions, ledger_accounts, etc.
   * @example { tables: { transactions: 'my_txns' } } // Custom table names
   */
  tables?: TableConfigOptions
}

export function createPostgresLedgerService(options: CreatePostgresLedgerServiceOptions): LedgerService {
  const ledgerRepository = new PostgresLedgerRepository({
    pool: options.pool,
    tables: options.tables
  })

  const priceRepository = new PostgresPriceRepository({
    pool: options.pool,
    tables: options.tables
  })

  return new LedgerService({
    ledgerRepository,
    priceRepository
  })
}

/**
 * Run grootboek migrations.
 *
 * For apps with their own migration system, use `generateSchema()` instead
 * to get the SQL and integrate it into your own migrations.
 */
export async function runMigrations(pool: Pool, tableConfig?: TableConfigOptions): Promise<void> {
  const tables = createTableNames(tableConfig)
  const client = await pool.connect()

  try {
    // Check current migration version
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${tables.schemaMigrations} (
        version INTEGER PRIMARY KEY,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `)

    const result = await client.query<{ version: number }>(`
      SELECT COALESCE(MAX(version), 0) as version FROM ${tables.schemaMigrations}
    `)

    const currentVersion = result.rows[0].version

    // Run migrations
    if (currentVersion < 1) {
      const schema = generateSchema(tables)
      await client.query(schema)
      await client.query(`
        INSERT INTO ${tables.schemaMigrations} (version) VALUES (1) ON CONFLICT DO NOTHING
      `)
    }
  } finally {
    client.release()
  }
}
