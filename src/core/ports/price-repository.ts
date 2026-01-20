import { Price } from '../domain/price.js'

export interface PriceFilter {
  baseCommodity?: string
  quoteCommodity?: string
  fromDate?: Date
  toDate?: Date
}

export interface PriceRepository {
  /**
   * List prices with optional filtering
   */
  listPrices(filter?: PriceFilter): Promise<Price[]>

  /**
   * Get the latest price for a commodity pair as of a given date
   */
  getPrice(
    baseCommodity: string,
    quoteCommodity: string,
    asOfDate?: Date
  ): Promise<Price | null>

  /**
   * Bulk upsert prices
   * Updates existing prices for the same date/commodity pair
   */
  upsertPrices(prices: Price[]): Promise<void>

  /**
   * Get all unique base commodities with prices
   */
  listBaseCommodities(): Promise<string[]>
}
