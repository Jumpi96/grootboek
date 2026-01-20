import { Decimal } from '../../core/utils/decimal.js'
import { Transaction } from '../../core/domain/transaction.js'
import { Posting } from '../../core/domain/posting.js'
import { Money } from '../../core/domain/money.js'
import { Account } from '../../core/domain/account.js'

export class TransactionBuilder {
  private id?: string
  private date: Date = new Date()
  private description: string = 'Test transaction'
  private postings: Posting[] = []
  private comment?: string
  private externalId?: string
  private metadata: Record<string, string> = {}

  withId(id: string): this {
    this.id = id
    return this
  }

  withDate(date: Date | string): this {
    this.date = typeof date === 'string' ? new Date(date) : date
    return this
  }

  withDescription(description: string): this {
    this.description = description
    return this
  }

  withComment(comment: string): this {
    this.comment = comment
    return this
  }

  withExternalId(externalId: string): this {
    this.externalId = externalId
    return this
  }

  withMetadata(metadata: Record<string, string>): this {
    this.metadata = metadata
    return this
  }

  addPosting(account: string, quantity: number | string, commodity: string): this {
    this.postings.push(new Posting({
      account: new Account({ name: account }),
      amount: new Money({
        quantity: new Decimal(quantity),
        commodity
      })
    }))
    return this
  }

  withPostings(postings: Posting[]): this {
    this.postings = postings
    return this
  }

  build(): Transaction {
    return new Transaction({
      id: this.id,
      date: this.date,
      description: this.description,
      postings: this.postings,
      comment: this.comment,
      externalId: this.externalId,
      metadata: this.metadata
    })
  }

  static balancedUSD(
    fromAccount: string,
    toAccount: string,
    amount: number | string
  ): Transaction {
    return new TransactionBuilder()
      .addPosting(fromAccount, new Decimal(amount).negated().toString(), '$')
      .addPosting(toAccount, amount, '$')
      .build()
  }
}
