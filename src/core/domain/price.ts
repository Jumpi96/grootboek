import { Decimal } from '../utils/decimal.js'

export interface PriceProps {
  date: Date
  baseCommodity: string
  quoteCommodity: string
  price: Decimal | string | number
  comment?: string
}

export class Price {
  readonly date: Date
  readonly baseCommodity: string
  readonly quoteCommodity: string
  readonly price: Decimal
  readonly comment?: string

  constructor(props: PriceProps) {
    this.date = props.date
    this.baseCommodity = props.baseCommodity
    this.quoteCommodity = props.quoteCommodity
    this.price = props.price instanceof Decimal
      ? props.price
      : new Decimal(props.price)
    this.comment = props.comment
  }

  convert(quantity: Decimal): Decimal {
    return quantity.times(this.price)
  }

  invert(): Price {
    return new Price({
      date: this.date,
      baseCommodity: this.quoteCommodity,
      quoteCommodity: this.baseCommodity,
      price: new Decimal(1).div(this.price),
      comment: this.comment
    })
  }

  equals(other: Price): boolean {
    return (
      this.date.getTime() === other.date.getTime() &&
      this.baseCommodity === other.baseCommodity &&
      this.quoteCommodity === other.quoteCommodity &&
      this.price.equals(other.price)
    )
  }

  toString(): string {
    const dateStr = this.date.toISOString().split('T')[0].replace(/-/g, '/')
    return `P ${dateStr} ${this.baseCommodity} ${this.quoteCommodity} ${this.price.toString()}`
  }
}
