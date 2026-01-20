import { Decimal } from '../utils/decimal.js'

export interface UnbalancedCommodity {
  commodity: string
  imbalance: Decimal
}

export class BalanceError extends Error {
  constructor(
    message: string,
    public readonly unbalanced: UnbalancedCommodity[]
  ) {
    super(message)
    this.name = 'BalanceError'
  }

  static fromImbalances(imbalances: Map<string, Decimal>): BalanceError {
    const unbalanced: UnbalancedCommodity[] = []
    for (const [commodity, imbalance] of imbalances) {
      if (!imbalance.isZero()) {
        unbalanced.push({ commodity, imbalance })
      }
    }

    const details = unbalanced
      .map(u => `${u.commodity}: ${u.imbalance.toString()}`)
      .join(', ')

    return new BalanceError(
      `Transaction does not balance: ${details}`,
      unbalanced
    )
  }
}
