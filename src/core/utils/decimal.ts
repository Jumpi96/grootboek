import { Decimal } from 'decimal.js'

// Configure Decimal.js for financial calculations
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_UP
})

export { Decimal }

export function isZero(value: Decimal): boolean {
  return value.isZero()
}

export function sum(values: Decimal[]): Decimal {
  return values.reduce((acc, val) => acc.plus(val), new Decimal(0))
}

export function abs(value: Decimal): Decimal {
  return value.abs()
}

export function negate(value: Decimal): Decimal {
  return value.negated()
}

export function formatDecimal(value: Decimal, precision: number): string {
  return value.toFixed(precision)
}
