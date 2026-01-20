import { describe, it, expect } from 'vitest'
import { Transaction } from '../../../src/core/domain/transaction.js'
import { Posting } from '../../../src/core/domain/posting.js'
import { Money } from '../../../src/core/domain/money.js'
import { Account } from '../../../src/core/domain/account.js'
import { ValidationError } from '../../../src/core/errors/validation-error.js'
import { BalanceError } from '../../../src/core/errors/balance-error.js'
import { Decimal } from '../../../src/core/utils/decimal.js'

describe('Transaction', () => {
  const makePosting = (account: string, quantity: number, commodity: string) =>
    new Posting({
      account: new Account({ name: account }),
      amount: new Money({ quantity: new Decimal(quantity), commodity })
    })

  it('should create a balanced transaction', () => {
    const txn = new Transaction({
      date: new Date('2024-01-15'),
      description: 'Test transaction',
      postings: [
        makePosting('Assets:Cash', -100, '$'),
        makePosting('Expenses:Food', 100, '$')
      ]
    })

    expect(txn.description).toBe('Test transaction')
    expect(txn.postings).toHaveLength(2)
    expect(txn.isBalanced()).toBe(true)
  })

  it('should create a multi-commodity transaction', () => {
    // Buying ETH with USD - each commodity balances independently
    const txn = new Transaction({
      date: new Date('2024-01-15'),
      description: 'Buy ETH',
      postings: [
        makePosting('Assets:Exchange', -1000, '$'),
        makePosting('Income:Trading', 1000, '$'),
        makePosting('Assets:Exchange', 0.5, 'ETH'),
        makePosting('Income:Trading', -0.5, 'ETH')
      ]
    })

    expect(txn.commodities).toContain('$')
    expect(txn.commodities).toContain('ETH')
    expect(txn.isBalanced()).toBe(true)
  })

  it('should throw on empty description', () => {
    expect(() => new Transaction({
      date: new Date(),
      description: '',
      postings: [
        makePosting('Assets:Cash', -100, '$'),
        makePosting('Expenses:Food', 100, '$')
      ]
    })).toThrow(ValidationError)
  })

  it('should throw on less than 2 postings', () => {
    expect(() => new Transaction({
      date: new Date(),
      description: 'Test',
      postings: [makePosting('Assets:Cash', 100, '$')]
    })).toThrow(ValidationError)
  })

  it('should throw on unbalanced transaction', () => {
    expect(() => new Transaction({
      date: new Date(),
      description: 'Unbalanced',
      postings: [
        makePosting('Assets:Cash', -100, '$'),
        makePosting('Expenses:Food', 50, '$')
      ]
    })).toThrow(BalanceError)
  })

  it('should throw on unbalanced multi-commodity transaction', () => {
    expect(() => new Transaction({
      date: new Date(),
      description: 'Unbalanced multi',
      postings: [
        makePosting('Assets:Cash', -100, '$'),
        makePosting('Assets:Exchange', 0.5, 'ETH')
      ]
    })).toThrow(BalanceError)
  })

  it('should list unique accounts', () => {
    const txn = new Transaction({
      date: new Date(),
      description: 'Test',
      postings: [
        makePosting('Assets:Cash', -50, '$'),
        makePosting('Assets:Cash', -50, '$'),
        makePosting('Expenses:Food', 100, '$')
      ]
    })

    expect(txn.accounts).toContain('Assets:Cash')
    expect(txn.accounts).toContain('Expenses:Food')
  })

  it('should get postings by account pattern', () => {
    const txn = new Transaction({
      date: new Date(),
      description: 'Test',
      postings: [
        makePosting('Assets:Bank:Checking', -100, '$'),
        makePosting('Assets:Bank:Savings', -50, '$'),
        makePosting('Expenses:Food', 150, '$')
      ]
    })

    const bankPostings = txn.getPostingsForAccount('Assets:Bank:**')
    expect(bankPostings).toHaveLength(2)

    const expensePostings = txn.getPostingsForAccount('Expenses:**')
    expect(expensePostings).toHaveLength(1)
  })

  it('should get postings by commodity', () => {
    const txn = new Transaction({
      date: new Date(),
      description: 'Test',
      postings: [
        makePosting('Assets:Exchange', -1000, '$'),
        makePosting('Income:Trading', 1000, '$'),
        makePosting('Assets:Exchange', 0.5, 'ETH'),
        makePosting('Income:Trading', -0.5, 'ETH')
      ]
    })

    const usdPostings = txn.getPostingsForCommodity('$')
    expect(usdPostings).toHaveLength(2)

    const ethPostings = txn.getPostingsForCommodity('ETH')
    expect(ethPostings).toHaveLength(2)
  })

  it('should support optional comment and metadata', () => {
    const txn = new Transaction({
      date: new Date(),
      description: 'Test',
      postings: [
        makePosting('Assets:Cash', -100, '$'),
        makePosting('Expenses:Food', 100, '$')
      ],
      comment: 'Test comment',
      externalId: 'ext-123',
      metadata: { source: 'import' }
    })

    expect(txn.comment).toBe('Test comment')
    expect(txn.externalId).toBe('ext-123')
    expect(txn.metadata.source).toBe('import')
  })

  it('should create copy with new ID', () => {
    const txn = new Transaction({
      date: new Date(),
      description: 'Test',
      postings: [
        makePosting('Assets:Cash', -100, '$'),
        makePosting('Expenses:Food', 100, '$')
      ]
    })

    const copy = txn.withId('new-id')
    expect(copy.id).toBe('new-id')
    expect(copy.description).toBe(txn.description)
  })
})
