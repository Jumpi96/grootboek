import { describe, it, expect, beforeEach } from 'vitest'
import { LedgerRepository, TransactionFilter } from '../../src/core/ports/ledger-repository.js'
import { Transaction } from '../../src/core/domain/transaction.js'
import { Posting } from '../../src/core/domain/posting.js'
import { Money } from '../../src/core/domain/money.js'
import { Account } from '../../src/core/domain/account.js'
import { Decimal } from '../../src/core/utils/decimal.js'

const makePosting = (account: string, quantity: number, commodity: string) =>
  new Posting({
    account: new Account({ name: account }),
    amount: new Money({ quantity: new Decimal(quantity), commodity })
  })

const makeTransaction = (
  date: string,
  description: string,
  postings: Posting[],
  externalId?: string
) =>
  new Transaction({
    date: new Date(date),
    description,
    postings,
    externalId
  })

export function createLedgerRepositoryContractTests(
  name: string,
  getRepository: () => Promise<LedgerRepository>,
  cleanup?: () => Promise<void>
) {
  describe(`LedgerRepository Contract: ${name}`, () => {
    let repo: LedgerRepository

    beforeEach(async () => {
      repo = await getRepository()
    })

    if (cleanup) {
      afterEach(async () => {
        await cleanup()
      })
    }

    describe('getHead', () => {
      it('should return head info', async () => {
        const head = await repo.getHead()
        expect(head).toBeDefined()
        expect(head.version).toBeDefined()
      })
    })

    describe('appendTransactions', () => {
      it('should append a single transaction', async () => {
        const txn = makeTransaction('2024-01-15', 'Test expense', [
          makePosting('Assets:Cash', -50, '$'),
          makePosting('Expenses:Food', 50, '$')
        ])

        const [saved] = await repo.appendTransactions([txn])

        expect(saved).toBeDefined()
        expect(saved.description).toBe('Test expense')
      })

      it('should append multiple transactions', async () => {
        const txns = [
          makeTransaction('2024-01-15', 'Expense 1', [
            makePosting('Assets:Cash', -25, '$'),
            makePosting('Expenses:Food', 25, '$')
          ]),
          makeTransaction('2024-01-16', 'Expense 2', [
            makePosting('Assets:Cash', -30, '$'),
            makePosting('Expenses:Transport', 30, '$')
          ])
        ]

        const saved = await repo.appendTransactions(txns)

        expect(saved).toHaveLength(2)
      })
    })

    describe('listTransactions', () => {
      it('should list all transactions', async () => {
        const txn = makeTransaction('2024-01-15', 'Test for listing', [
          makePosting('Assets:Cash', -100, '$'),
          makePosting('Expenses:Test', 100, '$')
        ])
        await repo.appendTransactions([txn])

        const transactions = await repo.listTransactions()

        expect(transactions.length).toBeGreaterThanOrEqual(1)
        expect(transactions.some(t => t.description === 'Test for listing')).toBe(true)
      })

      it('should filter by date range', async () => {
        await repo.appendTransactions([
          makeTransaction('2024-01-10', 'Jan 10', [
            makePosting('Assets:Cash', -10, '$'),
            makePosting('Expenses:Test', 10, '$')
          ]),
          makeTransaction('2024-01-20', 'Jan 20', [
            makePosting('Assets:Cash', -20, '$'),
            makePosting('Expenses:Test', 20, '$')
          ])
        ])

        const filter: TransactionFilter = {
          fromDate: new Date('2024-01-15'),
          toDate: new Date('2024-01-25')
        }

        const transactions = await repo.listTransactions(filter)

        expect(transactions.every(t => t.date >= filter.fromDate!)).toBe(true)
        expect(transactions.every(t => t.date <= filter.toDate!)).toBe(true)
      })
    })

    describe('getTransaction', () => {
      it('should return null for non-existent ID', async () => {
        const result = await repo.getTransaction('non-existent-id')
        expect(result).toBeNull()
      })
    })

    describe('existsExternalId', () => {
      it('should return true for existing external ID', async () => {
        const txn = makeTransaction(
          '2024-01-15',
          'With external ID',
          [
            makePosting('Assets:Cash', -50, '$'),
            makePosting('Expenses:Test', 50, '$')
          ],
          'ext-123'
        )
        await repo.appendTransactions([txn])

        const exists = await repo.existsExternalId('ext-123')
        expect(exists).toBe(true)
      })

      it('should return false for non-existent external ID', async () => {
        const exists = await repo.existsExternalId('non-existent-ext-id')
        expect(exists).toBe(false)
      })
    })

    describe('listAccounts', () => {
      it('should list unique accounts', async () => {
        await repo.appendTransactions([
          makeTransaction('2024-01-15', 'Test', [
            makePosting('Assets:Bank:Checking', -100, '$'),
            makePosting('Expenses:Food', 100, '$')
          ])
        ])

        const accounts = await repo.listAccounts()

        expect(accounts).toContain('Assets:Bank:Checking')
        expect(accounts).toContain('Expenses:Food')
      })
    })

    describe('listCommodities', () => {
      it('should list unique commodities', async () => {
        await repo.appendTransactions([
          makeTransaction('2024-01-15', 'Test', [
            makePosting('Assets:Bank', -100, '$'),
            makePosting('Assets:Crypto', 0.05, 'ETH'),
            makePosting('Income:Trading', 100, '$'),
            makePosting('Income:Trading', -0.05, 'ETH')
          ])
        ])

        const commodities = await repo.listCommodities()

        expect(commodities).toContain('$')
        expect(commodities).toContain('ETH')
      })
    })
  })
}
