export type CommodityType = 'fiat' | 'crypto' | 'stock' | 'fund' | 'bond'

export interface CommodityProps {
  symbol: string
  type: CommodityType
  precision?: number
  name?: string
}

const DEFAULT_PRECISION: Record<CommodityType, number> = {
  fiat: 2,
  crypto: 8,
  stock: 3,
  fund: 4,
  bond: 4
}

export class Commodity {
  readonly symbol: string
  readonly type: CommodityType
  readonly precision: number
  readonly name?: string

  constructor(props: CommodityProps) {
    if (!props.symbol || props.symbol.trim() === '') {
      throw new Error('Commodity symbol cannot be empty')
    }

    this.symbol = props.symbol
    this.type = props.type
    this.precision = props.precision ?? DEFAULT_PRECISION[props.type]
    this.name = props.name
  }

  equals(other: Commodity): boolean {
    return this.symbol === other.symbol
  }

  toString(): string {
    return this.symbol
  }
}

// Common commodities
export const USD = new Commodity({ symbol: '$', type: 'fiat', precision: 2 })
export const EUR = new Commodity({ symbol: 'EUR', type: 'fiat', precision: 2 })
export const ARS = new Commodity({ symbol: 'ARS', type: 'fiat', precision: 2 })
