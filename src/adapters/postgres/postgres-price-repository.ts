import type { Pool } from 'pg'
import { Price } from '../../core/domain/price.js'
import { PriceRepository, PriceFilter } from '../../core/ports/price-repository.js'
import { mapRowToPrice, mapPriceToParams, PriceRow } from './mappers/price-mapper.js'
import { TableNames, createTableNames, TableConfigOptions } from './table-config.js'

export interface PostgresPriceRepositoryOptions {
  pool: Pool
  /**
   * Table configuration - use prefix or custom table names
   */
  tables?: TableConfigOptions
}

export class PostgresPriceRepository implements PriceRepository {
  private readonly pool: Pool
  private readonly tables: TableNames

  constructor(options: PostgresPriceRepositoryOptions) {
    this.pool = options.pool
    this.tables = createTableNames(options.tables)
  }

  async listPrices(filter?: PriceFilter): Promise<Price[]> {
    let query = `
      SELECT date, base_symbol, quote_symbol, price, comment
      FROM ${this.tables.prices}
      WHERE 1=1
    `
    const params: unknown[] = []
    let paramIndex = 1

    if (filter?.baseCommodity) {
      query += ` AND base_symbol = $${paramIndex++}`
      params.push(filter.baseCommodity)
    }

    if (filter?.quoteCommodity) {
      query += ` AND quote_symbol = $${paramIndex++}`
      params.push(filter.quoteCommodity)
    }

    if (filter?.fromDate) {
      query += ` AND date >= $${paramIndex++}`
      params.push(filter.fromDate)
    }

    if (filter?.toDate) {
      query += ` AND date <= $${paramIndex++}`
      params.push(filter.toDate)
    }

    query += ' ORDER BY date DESC'

    const result = await this.pool.query<PriceRow>(query, params)

    return result.rows.map(mapRowToPrice)
  }

  async getPrice(
    baseCommodity: string,
    quoteCommodity: string,
    asOfDate?: Date
  ): Promise<Price | null> {
    const targetDate = asOfDate ?? new Date()

    // Try direct price first
    const directResult = await this.pool.query<PriceRow>(`
      SELECT date, base_symbol, quote_symbol, price, comment
      FROM ${this.tables.prices}
      WHERE base_symbol = $1 AND quote_symbol = $2 AND date <= $3
      ORDER BY date DESC
      LIMIT 1
    `, [baseCommodity, quoteCommodity, targetDate])

    if (directResult.rows.length > 0) {
      return mapRowToPrice(directResult.rows[0])
    }

    // Try inverse price
    const inverseResult = await this.pool.query<PriceRow>(`
      SELECT date, base_symbol, quote_symbol, price, comment
      FROM ${this.tables.prices}
      WHERE base_symbol = $1 AND quote_symbol = $2 AND date <= $3
      ORDER BY date DESC
      LIMIT 1
    `, [quoteCommodity, baseCommodity, targetDate])

    if (inverseResult.rows.length > 0) {
      return mapRowToPrice(inverseResult.rows[0]).invert()
    }

    return null
  }

  async upsertPrices(prices: Price[]): Promise<void> {
    if (prices.length === 0) return

    const client = await this.pool.connect()

    try {
      await client.query('BEGIN')

      for (const price of prices) {
        // Ensure commodities exist
        await this.ensureCommodity(client, price.baseCommodity)
        await this.ensureCommodity(client, price.quoteCommodity)

        const params = mapPriceToParams(price)

        await client.query(`
          INSERT INTO ${this.tables.prices} (date, base_symbol, quote_symbol, price, comment)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (date, base_symbol, quote_symbol)
          DO UPDATE SET price = EXCLUDED.price, comment = EXCLUDED.comment
        `, [params.date, params.base_symbol, params.quote_symbol, params.price, params.comment])
      }

      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK')
      throw e
    } finally {
      client.release()
    }
  }

  async listBaseCommodities(): Promise<string[]> {
    const result = await this.pool.query(`
      SELECT DISTINCT base_symbol FROM ${this.tables.prices} ORDER BY base_symbol
    `)

    return result.rows.map(row => row.base_symbol)
  }

  private async ensureCommodity(client: import('pg').PoolClient, symbol: string): Promise<void> {
    const type = this.inferCommodityType(symbol)

    await client.query(`
      INSERT INTO ${this.tables.commodities} (symbol, type)
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
}
