import { Account } from './account.js'
import { Money } from './money.js'

export interface PostingProps {
  account: Account | string
  amount: Money
  comment?: string
  metadata?: Record<string, string>
}

export class Posting {
  readonly account: Account
  readonly amount: Money
  readonly comment?: string
  readonly metadata: Record<string, string>

  constructor(props: PostingProps) {
    this.account = typeof props.account === 'string'
      ? new Account({ name: props.account })
      : props.account
    this.amount = props.amount
    this.comment = props.comment
    this.metadata = props.metadata ?? {}
  }

  get commodity(): string {
    return this.amount.commodity
  }

  get quantity(): import('../utils/decimal.js').Decimal {
    return this.amount.quantity
  }

  negate(): Posting {
    return new Posting({
      account: this.account,
      amount: this.amount.negate(),
      comment: this.comment,
      metadata: this.metadata
    })
  }

  withAmount(amount: Money): Posting {
    return new Posting({
      account: this.account,
      amount,
      comment: this.comment,
      metadata: this.metadata
    })
  }

  equals(other: Posting): boolean {
    return this.account.equals(other.account) && this.amount.equals(other.amount)
  }

  toString(): string {
    return `  ${this.account.name}  ${this.amount.toString()}`
  }
}
