import { Decimal } from '../utils/decimal.js'
import { Account } from '../domain/account.js'
import { Transaction } from '../domain/transaction.js'
import { Price } from '../domain/price.js'
import { Money } from '../domain/money.js'

export interface Position {
  account: string
  commodity: string
  quantity: Decimal
}

export interface Balance {
  account: string
  positions: Map<string, Decimal>
}

export interface CalculatorOptions {
  includeSubaccounts?: boolean
  asOfDate?: Date
}

export class BalanceCalculator {
  /**
   * Calculate positions for all accounts from transactions
   */
  calculatePositions(
    transactions: Transaction[],
    options: CalculatorOptions = {}
  ): Position[] {
    const { asOfDate } = options
    const positionMap = new Map<string, Decimal>()

    for (const txn of transactions) {
      // Skip transactions after asOfDate
      if (asOfDate && txn.date > asOfDate) {
        continue
      }

      for (const posting of txn.postings) {
        const key = `${posting.account.name}:${posting.commodity}`
        const current = positionMap.get(key) ?? new Decimal(0)
        positionMap.set(key, current.plus(posting.quantity))
      }
    }

    const positions: Position[] = []
    for (const [key, quantity] of positionMap) {
      if (!quantity.isZero()) {
        const lastColonIndex = key.lastIndexOf(':')
        // Find the commodity separator (last colon that's followed by a commodity, not account segment)
        // We need to handle this differently - the key format is "Account:Path:COMMODITY"
        // We need to find where account ends and commodity begins
        const parts = key.split(':')
        const commodity = parts[parts.length - 1]
        const account = parts.slice(0, -1).join(':')

        positions.push({ account, commodity, quantity })
      }
    }

    return positions
  }

  /**
   * Calculate balances (grouped positions) per account
   */
  calculateBalances(
    transactions: Transaction[],
    options: CalculatorOptions = {}
  ): Balance[] {
    const positions = this.calculatePositions(transactions, options)
    const balanceMap = new Map<string, Map<string, Decimal>>()

    for (const pos of positions) {
      if (!balanceMap.has(pos.account)) {
        balanceMap.set(pos.account, new Map())
      }
      const accountPositions = balanceMap.get(pos.account)!
      const current = accountPositions.get(pos.commodity) ?? new Decimal(0)
      accountPositions.set(pos.commodity, current.plus(pos.quantity))
    }

    // If includeSubaccounts, also aggregate into parent accounts
    if (options.includeSubaccounts) {
      const allAccounts = new Set(balanceMap.keys())

      for (const accountName of allAccounts) {
        const account = new Account({ name: accountName })
        let parent = account.parent

        while (parent) {
          if (!balanceMap.has(parent.name)) {
            balanceMap.set(parent.name, new Map())
          }

          const parentPositions = balanceMap.get(parent.name)!
          const childPositions = balanceMap.get(accountName)!

          for (const [commodity, quantity] of childPositions) {
            const current = parentPositions.get(commodity) ?? new Decimal(0)
            parentPositions.set(commodity, current.plus(quantity))
          }

          parent = parent.parent
        }
      }
    }

    const balances: Balance[] = []
    for (const [account, positions] of balanceMap) {
      balances.push({ account, positions })
    }

    return balances.sort((a, b) => a.account.localeCompare(b.account))
  }

  /**
   * Get balance for a specific account pattern
   */
  getBalanceForPattern(
    transactions: Transaction[],
    pattern: string,
    options: CalculatorOptions = {}
  ): Balance {
    const positions = this.calculatePositions(transactions, options)
    const aggregated = new Map<string, Decimal>()

    for (const pos of positions) {
      const account = new Account({ name: pos.account })
      if (account.matchesPattern(pattern)) {
        const current = aggregated.get(pos.commodity) ?? new Decimal(0)
        aggregated.set(pos.commodity, current.plus(pos.quantity))
      }
    }

    return { account: pattern, positions: aggregated }
  }

  /**
   * Convert a balance to a single commodity using prices
   */
  convertBalance(
    balance: Balance,
    targetCommodity: string,
    prices: Price[]
  ): Money {
    let total = new Decimal(0)

    for (const [commodity, quantity] of balance.positions) {
      if (commodity === targetCommodity) {
        total = total.plus(quantity)
      } else {
        // Find price to convert
        const price = this.findPrice(prices, commodity, targetCommodity)
        if (price) {
          total = total.plus(price.convert(quantity))
        }
        // If no price found, we skip (could throw or warn)
      }
    }

    return new Money({ quantity: total, commodity: targetCommodity })
  }

  private findPrice(
    prices: Price[],
    baseCommodity: string,
    quoteCommodity: string
  ): Price | null {
    // Find direct price
    const direct = prices.find(
      p => p.baseCommodity === baseCommodity && p.quoteCommodity === quoteCommodity
    )
    if (direct) return direct

    // Try inverse
    const inverse = prices.find(
      p => p.baseCommodity === quoteCommodity && p.quoteCommodity === baseCommodity
    )
    if (inverse) return inverse.invert()

    return null
  }
}
