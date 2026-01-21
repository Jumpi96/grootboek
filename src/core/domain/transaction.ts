import { randomUUID } from 'node:crypto'
import { Decimal } from '../utils/decimal.js'
import { Posting } from './posting.js'
import { BalanceError } from '../errors/balance-error.js'
import { ValidationError } from '../errors/validation-error.js'

export interface TransactionProps {
  id?: string
  date: Date
  description: string
  postings: Posting[]
  comment?: string
  externalId?: string
  metadata?: Record<string, string>
  skipValidation?: boolean
}

export class Transaction {
  readonly id: string
  readonly date: Date
  readonly description: string
  readonly postings: readonly Posting[]
  readonly comment?: string
  readonly externalId?: string
  readonly metadata: Record<string, string>

  constructor(props: TransactionProps) {
    this.id = props.id ?? randomUUID()
    this.date = props.date
    this.description = props.description
    this.postings = Object.freeze([...props.postings])
    this.comment = props.comment
    this.externalId = props.externalId
    this.metadata = props.metadata ?? {}

    if (!props.skipValidation) {
      this.validate()
    }
  }

  private validate(): void {
    if (!this.description || this.description.trim() === '') {
      throw new ValidationError('Transaction description cannot be empty', 'description')
    }

    if (this.postings.length < 2) {
      throw new ValidationError(
        'Transaction must have at least 2 postings',
        'postings',
        this.postings.length
      )
    }

    const imbalances = this.calculateImbalances()
    const hasImbalance = Array.from(imbalances.values()).some(v => !v.isZero())

    if (hasImbalance) {
      throw BalanceError.fromImbalances(imbalances)
    }
  }

  private calculateImbalances(): Map<string, Decimal> {
    const balances = new Map<string, Decimal>()

    for (const posting of this.postings) {
      const commodity = posting.commodity
      const current = balances.get(commodity) ?? new Decimal(0)
      balances.set(commodity, current.plus(posting.quantity))
    }

    return balances
  }

  get commodities(): string[] {
    const commodities = new Set<string>()
    for (const posting of this.postings) {
      commodities.add(posting.commodity)
    }
    return Array.from(commodities)
  }

  get accounts(): string[] {
    const accounts = new Set<string>()
    for (const posting of this.postings) {
      accounts.add(posting.account.name)
    }
    return Array.from(accounts)
  }

  getPostingsForAccount(accountPattern: string): Posting[] {
    return this.postings.filter(p => p.account.matchesPattern(accountPattern))
  }

  getPostingsForCommodity(commodity: string): Posting[] {
    return this.postings.filter(p => p.commodity === commodity)
  }

  isBalanced(): boolean {
    const imbalances = this.calculateImbalances()
    return Array.from(imbalances.values()).every(v => v.isZero())
  }

  withId(id: string): Transaction {
    return new Transaction({
      id,
      date: this.date,
      description: this.description,
      postings: [...this.postings],
      comment: this.comment,
      externalId: this.externalId,
      metadata: this.metadata,
      skipValidation: true
    })
  }

  equals(other: Transaction): boolean {
    return this.id === other.id
  }

  toString(): string {
    const dateStr = this.date.toISOString().split('T')[0].replace(/-/g, '/')
    const lines = [`${dateStr} ${this.description}`]
    for (const posting of this.postings) {
      lines.push(posting.toString())
    }
    return lines.join('\n')
  }
}
