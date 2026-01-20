import { Decimal } from '../../../core/utils/decimal.js'
import { Price } from '../../../core/domain/price.js'

export interface PriceRow {
  date: Date
  base_symbol: string
  quote_symbol: string
  price: string
  comment: string | null
}

export function mapRowToPrice(row: PriceRow): Price {
  return new Price({
    date: row.date,
    baseCommodity: row.base_symbol,
    quoteCommodity: row.quote_symbol,
    price: new Decimal(row.price),
    comment: row.comment ?? undefined
  })
}

export function mapPriceToParams(price: Price): {
  date: Date
  base_symbol: string
  quote_symbol: string
  price: string
  comment: string | null
} {
  return {
    date: price.date,
    base_symbol: price.baseCommodity,
    quote_symbol: price.quoteCommodity,
    price: price.price.toString(),
    comment: price.comment ?? null
  }
}
