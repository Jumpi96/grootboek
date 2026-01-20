import { Decimal } from '../utils/decimal.js'
import { Commodity } from './commodity.js'

export interface MoneyProps {
  quantity: Decimal | string | number
  commodity: Commodity | string
}

export class Money {
  readonly quantity: Decimal
  readonly commodity: string

  constructor(props: MoneyProps) {
    this.quantity = props.quantity instanceof Decimal
      ? props.quantity
      : new Decimal(props.quantity)
    this.commodity = typeof props.commodity === 'string'
      ? props.commodity
      : props.commodity.symbol
  }

  static zero(commodity: Commodity | string): Money {
    return new Money({ quantity: 0, commodity })
  }

  isZero(): boolean {
    return this.quantity.isZero()
  }

  isPositive(): boolean {
    return this.quantity.greaterThan(0)
  }

  isNegative(): boolean {
    return this.quantity.lessThan(0)
  }

  abs(): Money {
    return new Money({
      quantity: this.quantity.abs(),
      commodity: this.commodity
    })
  }

  negate(): Money {
    return new Money({
      quantity: this.quantity.negated(),
      commodity: this.commodity
    })
  }

  add(other: Money): Money {
    if (this.commodity !== other.commodity) {
      throw new Error(
        `Cannot add different commodities: ${this.commodity} and ${other.commodity}`
      )
    }
    return new Money({
      quantity: this.quantity.plus(other.quantity),
      commodity: this.commodity
    })
  }

  subtract(other: Money): Money {
    if (this.commodity !== other.commodity) {
      throw new Error(
        `Cannot subtract different commodities: ${this.commodity} and ${other.commodity}`
      )
    }
    return new Money({
      quantity: this.quantity.minus(other.quantity),
      commodity: this.commodity
    })
  }

  multiply(factor: Decimal | number | string): Money {
    const factorDecimal = factor instanceof Decimal ? factor : new Decimal(factor)
    return new Money({
      quantity: this.quantity.times(factorDecimal),
      commodity: this.commodity
    })
  }

  equals(other: Money): boolean {
    return this.commodity === other.commodity && this.quantity.equals(other.quantity)
  }

  toString(): string {
    return `${this.commodity} ${this.quantity.toString()}`
  }
}
