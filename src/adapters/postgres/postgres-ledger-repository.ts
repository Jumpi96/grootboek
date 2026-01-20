import type { Pool, PoolClient } from 'pg'
import { Transaction } from '../../core/domain/transaction.js'
import { Account } from '../../core/domain/account.js'
import {
  LedgerRepository,
  TransactionFilter,
  HeadInfo
} from '../../core/ports/ledger-repository.js'
import {
  mapRowToTransaction,
  mapTransactionToParams,
  mapPostingToParams,
  TransactionRow,
  PostingRow
} from './mappers/transaction-mapper.js'

export interface PostgresLedgerRepositoryOptions {
  pool: Pool
}

export class PostgresLedgerRepository implements LedgerRepository {
  private readonly pool: Pool

  constructor(options: PostgresLedgerRepositoryOptions) {
    this.pool = options.pool
  }

  async getHead(): Promise<HeadInfo> {
    const result = await this.pool.query(`
      SELECT MAX(created_at) as last_modified, COUNT(*) as version
      FROM transactions
    `)

    return {
      version: result.rows[0]?.version?.toString() ?? '0',
      lastModified: result.rows[0]?.last_modified ?? undefined
    }
  }

  async listTransactions(filter?: TransactionFilter): Promise<Transaction[]> {
    let query = `
      SELECT t.id, t.date, t.description, t.comment, t.external_id, t.metadata
      FROM transactions t
      WHERE 1=1
    `
    const params: unknown[] = []
    let paramIndex = 1

    if (filter?.fromDate) {
      query += ` AND t.date >= $${paramIndex++}`
      params.push(filter.fromDate)
    }

    if (filter?.toDate) {
      query += ` AND t.date <= $${paramIndex++}`
      params.push(filter.toDate)
    }

    if (filter?.description) {
      query += ` AND t.description ILIKE $${paramIndex++}`
      params.push(`%${filter.description}%`)
    }

    if (filter?.accountPattern) {
      query += ` AND EXISTS (
        SELECT 1 FROM postings p
        JOIN accounts a ON p.account_id = a.id
        WHERE p.transaction_id = t.id
        AND a.full_name LIKE $${paramIndex++}
      )`
      params.push(this.patternToLike(filter.accountPattern))
    }

    if (filter?.commodity) {
      query += ` AND EXISTS (
        SELECT 1 FROM postings p
        WHERE p.transaction_id = t.id
        AND p.commodity_symbol = $${paramIndex++}
      )`
      params.push(filter.commodity)
    }

    query += ' ORDER BY t.date, t.created_at'

    if (filter?.limit) {
      query += ` LIMIT $${paramIndex++}`
      params.push(filter.limit)
    }

    if (filter?.offset) {
      query += ` OFFSET $${paramIndex++}`
      params.push(filter.offset)
    }

    const result = await this.pool.query<TransactionRow>(query, params)

    const transactions: Transaction[] = []

    for (const row of result.rows) {
      const postings = await this.getPostingsForTransaction(row.id)
      transactions.push(mapRowToTransaction(row, postings))
    }

    return transactions
  }

  async getTransaction(id: string): Promise<Transaction | null> {
    const result = await this.pool.query<TransactionRow>(`
      SELECT id, date, description, comment, external_id, metadata
      FROM transactions
      WHERE id = $1
    `, [id])

    if (result.rows.length === 0) {
      return null
    }

    const row = result.rows[0]
    const postings = await this.getPostingsForTransaction(id)

    return mapRowToTransaction(row, postings)
  }

  async appendTransactions(transactions: Transaction[]): Promise<Transaction[]> {
    const client = await this.pool.connect()

    try {
      await client.query('BEGIN')

      const results: Transaction[] = []

      for (const txn of transactions) {
        const savedTxn = await this.insertTransaction(client, txn)
        results.push(savedTxn)
      }

      await client.query('COMMIT')
      return results
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }
  }

  async existsExternalId(externalId: string): Promise<boolean> {
    const result = await this.pool.query(`
      SELECT 1 FROM transactions WHERE external_id = $1 LIMIT 1
    `, [externalId])

    return result.rows.length > 0
  }

  async listAccounts(): Promise<string[]> {
    const result = await this.pool.query(`
      SELECT full_name FROM accounts ORDER BY full_name
    `)

    return result.rows.map(row => row.full_name)
  }

  async listCommodities(): Promise<string[]> {
    const result = await this.pool.query(`
      SELECT DISTINCT commodity_symbol FROM postings ORDER BY commodity_symbol
    `)

    return result.rows.map(row => row.commodity_symbol)
  }

  private async insertTransaction(
    client: PoolClient,
    txn: Transaction
  ): Promise<Transaction> {
    const params = mapTransactionToParams(txn)

    const result = await client.query<{ id: string }>(`
      INSERT INTO transactions (id, date, description, comment, external_id, metadata)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [params.id, params.date, params.description, params.comment, params.external_id, params.metadata])

    const transactionId = result.rows[0].id

    for (const posting of txn.postings) {
      const accountId = await this.ensureAccount(client, posting.account)
      await this.ensureCommodity(client, posting.commodity)

      const postingParams = mapPostingToParams(posting, transactionId, accountId)

      await client.query(`
        INSERT INTO postings (transaction_id, account_id, quantity, commodity_symbol, comment, metadata)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        postingParams.transaction_id,
        postingParams.account_id,
        postingParams.quantity,
        postingParams.commodity_symbol,
        postingParams.comment,
        postingParams.metadata
      ])
    }

    return txn.withId(transactionId)
  }

  private async ensureAccount(client: PoolClient, account: Account): Promise<number> {
    // Try to insert, on conflict get existing
    const result = await client.query<{ id: number }>(`
      INSERT INTO accounts (full_name, kind)
      VALUES ($1, $2)
      ON CONFLICT (full_name) DO UPDATE SET full_name = EXCLUDED.full_name
      RETURNING id
    `, [account.name, account.kind])

    return result.rows[0].id
  }

  private async ensureCommodity(client: PoolClient, symbol: string): Promise<void> {
    // Infer commodity type from symbol
    const type = this.inferCommodityType(symbol)

    await client.query(`
      INSERT INTO commodities (symbol, type)
      VALUES ($1, $2)
      ON CONFLICT (symbol) DO NOTHING
    `, [symbol, type])
  }

  private inferCommodityType(symbol: string): string {
    if (symbol === '$' || symbol === 'USD' || symbol === 'EUR' || symbol === 'ARS') {
      return 'fiat'
    }
    if (['BTC', 'ETH', 'DAI', 'USDC', 'USDT'].includes(symbol)) {
      return 'crypto'
    }
    return 'stock'
  }

  private async getPostingsForTransaction(transactionId: string): Promise<PostingRow[]> {
    const result = await this.pool.query<PostingRow>(`
      SELECT p.id, p.transaction_id, p.account_id, a.full_name as account_full_name,
             p.quantity, p.commodity_symbol, p.comment, p.metadata
      FROM postings p
      JOIN accounts a ON p.account_id = a.id
      WHERE p.transaction_id = $1
      ORDER BY p.id
    `, [transactionId])

    return result.rows
  }

  private patternToLike(pattern: string): string {
    // Convert account pattern to SQL LIKE pattern
    // * -> matches one segment (no colon)
    // ** -> matches anything
    return pattern
      .replace(/\*\*/g, '%')
      .replace(/\*/g, '%')
  }
}
