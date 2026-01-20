import { Decimal } from '../utils/decimal.js'
import { Transaction } from '../domain/transaction.js'
import { Price } from '../domain/price.js'
import { Money } from '../domain/money.js'
import { LedgerRepository, TransactionFilter, HeadInfo } from '../ports/ledger-repository.js'
import { PriceRepository, PriceFilter } from '../ports/price-repository.js'
import { BalanceCalculator, Balance, Position } from './balance-calculator.js'

export interface LedgerServiceOptions {
  ledgerRepository: LedgerRepository
  priceRepository: PriceRepository
}

export class LedgerService {
  private readonly ledgerRepo: LedgerRepository
  private readonly priceRepo: PriceRepository
  private readonly calculator: BalanceCalculator

  constructor(options: LedgerServiceOptions) {
    this.ledgerRepo = options.ledgerRepository
    this.priceRepo = options.priceRepository
    this.calculator = new BalanceCalculator()
  }

  // === Transaction Operations ===

  async getHead(): Promise<HeadInfo> {
    return this.ledgerRepo.getHead()
  }

  async listTransactions(filter?: TransactionFilter): Promise<Transaction[]> {
    return this.ledgerRepo.listTransactions(filter)
  }

  async getTransaction(id: string): Promise<Transaction | null> {
    return this.ledgerRepo.getTransaction(id)
  }

  async appendTransactions(transactions: Transaction[]): Promise<Transaction[]> {
    return this.ledgerRepo.appendTransactions(transactions)
  }

  async appendTransaction(transaction: Transaction): Promise<Transaction> {
    const [result] = await this.appendTransactions([transaction])
    return result
  }

  async existsExternalId(externalId: string): Promise<boolean> {
    return this.ledgerRepo.existsExternalId(externalId)
  }

  // === Price Operations ===

  async listPrices(filter?: PriceFilter): Promise<Price[]> {
    return this.priceRepo.listPrices(filter)
  }

  async getPrice(
    baseCommodity: string,
    quoteCommodity: string,
    asOfDate?: Date
  ): Promise<Price | null> {
    return this.priceRepo.getPrice(baseCommodity, quoteCommodity, asOfDate)
  }

  async upsertPrices(prices: Price[]): Promise<void> {
    return this.priceRepo.upsertPrices(prices)
  }

  // === Account Operations ===

  async listAccounts(): Promise<string[]> {
    return this.ledgerRepo.listAccounts()
  }

  async listCommodities(): Promise<string[]> {
    return this.ledgerRepo.listCommodities()
  }

  // === Balance Operations ===

  async getPositions(options?: {
    asOfDate?: Date
    filter?: TransactionFilter
  }): Promise<Position[]> {
    const transactions = await this.ledgerRepo.listTransactions(options?.filter)
    return this.calculator.calculatePositions(transactions, {
      asOfDate: options?.asOfDate
    })
  }

  async getBalances(options?: {
    asOfDate?: Date
    includeSubaccounts?: boolean
    filter?: TransactionFilter
  }): Promise<Balance[]> {
    const transactions = await this.ledgerRepo.listTransactions(options?.filter)
    return this.calculator.calculateBalances(transactions, {
      asOfDate: options?.asOfDate,
      includeSubaccounts: options?.includeSubaccounts
    })
  }

  async getBalance(
    accountPattern: string,
    options?: {
      asOfDate?: Date
      filter?: TransactionFilter
    }
  ): Promise<Balance> {
    const transactions = await this.ledgerRepo.listTransactions(options?.filter)
    return this.calculator.getBalanceForPattern(transactions, accountPattern, {
      asOfDate: options?.asOfDate
    })
  }

  async getBalanceInCommodity(
    accountPattern: string,
    targetCommodity: string,
    options?: {
      asOfDate?: Date
      filter?: TransactionFilter
    }
  ): Promise<Money> {
    const balance = await this.getBalance(accountPattern, options)
    const prices = await this.priceRepo.listPrices()
    return this.calculator.convertBalance(balance, targetCommodity, prices)
  }

  // === Reporting ===

  async getRegister(
    accountPattern: string,
    options?: TransactionFilter
  ): Promise<Array<{
    date: Date
    description: string
    account: string
    amount: Money
    runningBalance: Money
  }>> {
    const transactions = await this.ledgerRepo.listTransactions(options)
    const register: Array<{
      date: Date
      description: string
      account: string
      amount: Money
      runningBalance: Money
    }> = []

    const runningBalances = new Map<string, Decimal>()

    for (const txn of transactions) {
      for (const posting of txn.postings) {
        if (posting.account.matchesPattern(accountPattern)) {
          const commodity = posting.commodity
          const key = `${posting.account.name}:${commodity}`
          const current = runningBalances.get(key) ?? new Decimal(0)
          const newBalance = current.plus(posting.quantity)
          runningBalances.set(key, newBalance)

          register.push({
            date: txn.date,
            description: txn.description,
            account: posting.account.name,
            amount: posting.amount,
            runningBalance: new Money({ quantity: newBalance, commodity })
          })
        }
      }
    }

    return register
  }
}
