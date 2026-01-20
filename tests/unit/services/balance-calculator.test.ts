import { describe, it, expect } from 'vitest'
import { BalanceCalculator } from '../../../src/core/services/balance-calculator.js'
import { Transaction } from '../../../src/core/domain/transaction.js'
import { Posting } from '../../../src/core/domain/posting.js'
import { Money } from '../../../src/core/domain/money.js'
import { Account } from '../../../src/core/domain/account.js'
import { Price } from '../../../src/core/domain/price.js'
import { Decimal } from '../../../src/core/utils/decimal.js'

describe('BalanceCalculator', () => {
  const calculator = new BalanceCalculator()

  const makePosting = (account: string, quantity: number, commodity: string) =>
    new Posting({
      account: new Account({ name: account }),
      amount: new Money({ quantity: new Decimal(quantity), commodity })
    })

  const makeTransaction = (
    date: string,
    description: string,
    postings: Posting[]
  ) =>
    new Transaction({
      date: new Date(date),
      description,
      postings
    })

  const sampleTransactions = [
    makeTransaction('2024-01-01', 'Opening', [
      makePosting('Income:Salary', -1000, '$'),
      makePosting('Assets:Bank:Checking', 1000, '$')
    ]),
    makeTransaction('2024-01-15', 'Groceries', [
      makePosting('Assets:Bank:Checking', -100, '$'),
      makePosting('Expenses:Food', 100, '$')
    ]),
    makeTransaction('2024-01-20', 'Transfer', [
      makePosting('Assets:Bank:Checking', -200, '$'),
      makePosting('Assets:Bank:Savings', 200, '$')
    ])
  ]

  it('should calculate positions', () => {
    const positions = calculator.calculatePositions(sampleTransactions)

    const checkingPos = positions.find(
      p => p.account === 'Assets:Bank:Checking' && p.commodity === '$'
    )
    expect(checkingPos?.quantity.toString()).toBe('700')

    const savingsPos = positions.find(
      p => p.account === 'Assets:Bank:Savings' && p.commodity === '$'
    )
    expect(savingsPos?.quantity.toString()).toBe('200')

    const foodPos = positions.find(
      p => p.account === 'Expenses:Food' && p.commodity === '$'
    )
    expect(foodPos?.quantity.toString()).toBe('100')
  })

  it('should calculate balances', () => {
    const balances = calculator.calculateBalances(sampleTransactions)

    const checkingBal = balances.find(b => b.account === 'Assets:Bank:Checking')
    expect(checkingBal?.positions.get('$')?.toString()).toBe('700')
  })

  it('should aggregate subaccounts when requested', () => {
    const balances = calculator.calculateBalances(sampleTransactions, {
      includeSubaccounts: true
    })

    const bankBal = balances.find(b => b.account === 'Assets:Bank')
    expect(bankBal?.positions.get('$')?.toString()).toBe('900') // 700 + 200

    const assetsBal = balances.find(b => b.account === 'Assets')
    expect(assetsBal?.positions.get('$')?.toString()).toBe('900')
  })

  it('should filter by asOfDate', () => {
    const positions = calculator.calculatePositions(sampleTransactions, {
      asOfDate: new Date('2024-01-15')
    })

    const checkingPos = positions.find(
      p => p.account === 'Assets:Bank:Checking' && p.commodity === '$'
    )
    // Before the Jan 20 transfer
    expect(checkingPos?.quantity.toString()).toBe('900')
  })

  it('should get balance for pattern', () => {
    const balance = calculator.getBalanceForPattern(
      sampleTransactions,
      'Assets:Bank:**'
    )

    expect(balance.positions.get('$')?.toString()).toBe('900') // 700 + 200
  })

  it('should handle multi-commodity transactions', () => {
    const multiTxns = [
      makeTransaction('2024-01-01', 'Opening', [
        makePosting('Income:Salary', -1000, '$'),
        makePosting('Assets:Bank', 1000, '$')
      ]),
      makeTransaction('2024-01-10', 'Buy ETH', [
        makePosting('Assets:Bank', -500, '$'),
        makePosting('Income:Trading', 500, '$'),
        makePosting('Assets:Crypto', 0.25, 'ETH'),
        makePosting('Income:Trading', -0.25, 'ETH')
      ])
    ]

    const positions = calculator.calculatePositions(multiTxns)

    const bankPos = positions.find(p => p.account === 'Assets:Bank' && p.commodity === '$')
    expect(bankPos?.quantity.toString()).toBe('500')

    const ethPos = positions.find(p => p.account === 'Assets:Crypto' && p.commodity === 'ETH')
    expect(ethPos?.quantity.toString()).toBe('0.25')
  })

  it('should convert balance to single commodity', () => {
    const multiTxns = [
      makeTransaction('2024-01-01', 'Opening', [
        makePosting('Income:Salary', -500, '$'),
        makePosting('Assets:Bank', 500, '$')
      ]),
      makeTransaction('2024-01-02', 'Buy ETH', [
        makePosting('Income:Trading', -0.25, 'ETH'),
        makePosting('Assets:Crypto', 0.25, 'ETH')
      ])
    ]

    const balance = calculator.getBalanceForPattern(multiTxns, 'Assets:**')

    const prices = [
      new Price({
        date: new Date('2024-01-01'),
        baseCommodity: 'ETH',
        quoteCommodity: '$',
        price: new Decimal('2000')
      })
    ]

    const converted = calculator.convertBalance(balance, '$', prices)

    // 500 USD + 0.25 ETH * 2000 = 500 + 500 = 1000
    expect(converted.quantity.toString()).toBe('1000')
    expect(converted.commodity).toBe('$')
  })

  it('should exclude zero positions', () => {
    const txns = [
      makeTransaction('2024-01-01', 'In and out', [
        makePosting('Assets:Bank', 100, '$'),
        makePosting('Income:Salary', -100, '$')
      ]),
      makeTransaction('2024-01-02', 'Spend all', [
        makePosting('Assets:Bank', -100, '$'),
        makePosting('Expenses:Food', 100, '$')
      ])
    ]

    const positions = calculator.calculatePositions(txns)

    const bankPos = positions.find(p => p.account === 'Assets:Bank')
    expect(bankPos).toBeUndefined() // Zero balance is excluded
  })
})
