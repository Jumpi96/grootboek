import { Decimal } from '../../../core/utils/decimal.js'
import { Transaction } from '../../../core/domain/transaction.js'
import { Posting } from '../../../core/domain/posting.js'
import { Money } from '../../../core/domain/money.js'
import { Account } from '../../../core/domain/account.js'

export interface TransactionRow {
  id: string
  date: Date
  description: string
  comment: string | null
  external_id: string | null
  metadata: Record<string, string>
}

export interface PostingRow {
  id: number
  transaction_id: string
  account_id: number
  account_full_name: string
  quantity: string
  commodity_symbol: string
  comment: string | null
  metadata: Record<string, string>
}

export function mapRowToTransaction(
  row: TransactionRow,
  postingRows: PostingRow[]
): Transaction {
  const postings = postingRows.map(mapRowToPosting)

  return new Transaction({
    id: row.id,
    date: row.date,
    description: row.description,
    postings,
    comment: row.comment ?? undefined,
    externalId: row.external_id ?? undefined,
    metadata: row.metadata ?? {}
  })
}

export function mapRowToPosting(row: PostingRow): Posting {
  return new Posting({
    account: new Account({ name: row.account_full_name }),
    amount: new Money({
      quantity: new Decimal(row.quantity),
      commodity: row.commodity_symbol
    }),
    comment: row.comment ?? undefined,
    metadata: row.metadata ?? {}
  })
}

export function mapTransactionToParams(txn: Transaction): {
  id: string
  date: Date
  description: string
  comment: string | null
  external_id: string | null
  metadata: Record<string, string>
} {
  return {
    id: txn.id,
    date: txn.date,
    description: txn.description,
    comment: txn.comment ?? null,
    external_id: txn.externalId ?? null,
    metadata: txn.metadata
  }
}

export function mapPostingToParams(
  posting: Posting,
  transactionId: string,
  accountId: number
): {
  transaction_id: string
  account_id: number
  quantity: string
  commodity_symbol: string
  comment: string | null
  metadata: Record<string, string>
} {
  return {
    transaction_id: transactionId,
    account_id: accountId,
    quantity: posting.quantity.toString(),
    commodity_symbol: posting.commodity,
    comment: posting.comment ?? null,
    metadata: posting.metadata
  }
}
