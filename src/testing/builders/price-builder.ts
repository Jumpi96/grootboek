import { Decimal } from '../../core/utils/decimal.js'
import { Price } from '../../core/domain/price.js'

export class PriceBuilder {
  private date: Date = new Date()
  private baseCommodity: string = 'ETH'
  private quoteCommodity: string = '$'
  private price: Decimal = new Decimal('1000')
  private comment?: string

  withDate(date: Date | string): this {
    this.date = typeof date === 'string' ? new Date(date) : date
    return this
  }

  withBaseCommodity(commodity: string): this {
    this.baseCommodity = commodity
    return this
  }

  withQuoteCommodity(commodity: string): this {
    this.quoteCommodity = commodity
    return this
  }

  withPrice(price: number | string): this {
    this.price = new Decimal(price)
    return this
  }

  withComment(comment: string): this {
    this.comment = comment
    return this
  }

  build(): Price {
    return new Price({
      date: this.date,
      baseCommodity: this.baseCommodity,
      quoteCommodity: this.quoteCommodity,
      price: this.price,
      comment: this.comment
    })
  }
}
