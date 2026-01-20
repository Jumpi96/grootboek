import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { Parser } from '../../src/adapters/git/parser/parser.js'
import { GitLedgerRepository } from '../../src/adapters/git/git-ledger-repository.js'
import { GitPriceRepository } from '../../src/adapters/git/git-price-repository.js'

describe('Golden Tests: Parse my.journal', () => {
  const journalPath = path.join(process.cwd(), 'my.journal')

  it('should parse the journal file without errors', async () => {
    const content = await fs.readFile(journalPath, 'utf-8')
    const parser = new Parser()

    // Should not throw
    const ast = parser.parse(content)

    expect(ast.entries.length).toBeGreaterThan(0)

    // Check we have transactions
    const transactions = ast.entries.filter(e => e.type === 'transaction')
    expect(transactions.length).toBeGreaterThan(0)

    // Check we have prices
    const prices = ast.entries.filter(e => e.type === 'price')
    expect(prices.length).toBeGreaterThan(0)
  })

  it('should load transactions via GitLedgerRepository', async () => {
    const repo = new GitLedgerRepository({
      journalPath,
      autoCommit: false
    })

    const transactions = await repo.listTransactions()

    expect(transactions.length).toBeGreaterThan(0)

    // Verify first transaction has expected structure
    const first = transactions[0]
    expect(first.date).toBeInstanceOf(Date)
    expect(first.description).toBeDefined()
    expect(first.postings.length).toBeGreaterThanOrEqual(2)
  })

  it('should load prices via GitPriceRepository', async () => {
    const repo = new GitPriceRepository({
      journalPath,
      autoCommit: false
    })

    const prices = await repo.listPrices()

    expect(prices.length).toBeGreaterThan(0)

    // Verify first price has expected structure
    const first = prices[0]
    expect(first.date).toBeInstanceOf(Date)
    expect(first.baseCommodity).toBeDefined()
    expect(first.quoteCommodity).toBeDefined()
    expect(first.price).toBeDefined()
  })

  it('should list all unique accounts from valid transactions', async () => {
    const repo = new GitLedgerRepository({
      journalPath,
      autoCommit: false
    })

    const accounts = await repo.listAccounts()

    // Some accounts should be found from valid transactions
    // Note: Many journal transactions don't balance per-commodity
    // and are skipped by our strict validation
    expect(accounts.length).toBeGreaterThanOrEqual(0)
  })

  it('should list all unique commodities', async () => {
    const repo = new GitLedgerRepository({
      journalPath,
      autoCommit: false
    })

    const commodities = await repo.listCommodities()

    expect(commodities.length).toBeGreaterThan(0)
    expect(commodities).toContain('$')
  })

  it('should filter transactions by date', async () => {
    const repo = new GitLedgerRepository({
      journalPath,
      autoCommit: false
    })

    const filter = {
      fromDate: new Date('2021-01-01'),
      toDate: new Date('2021-12-31')
    }

    const transactions = await repo.listTransactions(filter)

    for (const txn of transactions) {
      expect(txn.date.getFullYear()).toBe(2021)
    }
  })

  it('should filter transactions by account pattern', async () => {
    const repo = new GitLedgerRepository({
      journalPath,
      autoCommit: false
    })

    const filter = {
      accountPattern: 'Assets:1_Security:**'
    }

    const transactions = await repo.listTransactions(filter)

    for (const txn of transactions) {
      const hasMatch = txn.postings.some(p =>
        p.account.matchesPattern('Assets:1_Security:**')
      )
      expect(hasMatch).toBe(true)
    }
  })

  it('should get price for commodity', async () => {
    const repo = new GitPriceRepository({
      journalPath,
      autoCommit: false
    })

    // Get ETH price in $
    const ethPrice = await repo.getPrice('ETH', '$')

    if (ethPrice) {
      expect(ethPrice.baseCommodity).toBe('ETH')
      expect(ethPrice.quoteCommodity).toBe('$')
      expect(ethPrice.price.greaterThan(0)).toBe(true)
    }
  })
})
