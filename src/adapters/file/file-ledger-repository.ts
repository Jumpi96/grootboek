import { Decimal } from '../../core/utils/decimal.js'
import { Transaction } from '../../core/domain/transaction.js'
import { Posting } from '../../core/domain/posting.js'
import { Money } from '../../core/domain/money.js'
import { Account } from '../../core/domain/account.js'
import {
  LedgerRepository,
  TransactionFilter,
  HeadInfo
} from '../../core/ports/ledger-repository.js'
import { Parser } from '../git/parser/parser.js'
import { TransactionNode, PostingNode } from '../git/parser/ast.js'
import { JournalWriter } from '../git/serializer/journal-writer.js'
import { FileProvider, NodeFileProvider } from './file-provider.js'

export interface FileLedgerRepositoryOptions {
  /**
   * Path to the journal file
   */
  journalPath: string

  /**
   * File provider implementation.
   * Defaults to NodeFileProvider for Node.js environments.
   * Pass InMemoryFileProvider for testing or a custom provider for browser.
   */
  fileProvider?: FileProvider
}

export class FileLedgerRepository implements LedgerRepository {
  private readonly journalPath: string
  private readonly fileProvider: FileProvider
  private readonly parser: Parser
  private readonly writer: JournalWriter

  private cachedTransactions: Transaction[] | null = null
  private cacheVersion: string | null = null

  constructor(options: FileLedgerRepositoryOptions) {
    this.journalPath = options.journalPath
    this.fileProvider = options.fileProvider ?? new NodeFileProvider()
    this.parser = new Parser()
    this.writer = new JournalWriter()
  }

  async getHead(): Promise<HeadInfo> {
    const stat = await this.fileProvider.stat(this.journalPath)

    return {
      version: stat?.lastModified.toISOString() ?? 'empty',
      lastModified: stat?.lastModified
    }
  }

  async listTransactions(filter?: TransactionFilter): Promise<Transaction[]> {
    const transactions = await this.loadTransactions()

    let result = transactions

    if (filter) {
      result = result.filter((txn) => {
        if (filter.fromDate && txn.date < filter.fromDate) return false
        if (filter.toDate && txn.date > filter.toDate) return false

        if (filter.accountPattern) {
          const hasMatch = txn.postings.some(p =>
            p.account.matchesPattern(filter.accountPattern!)
          )
          if (!hasMatch) return false
        }

        if (filter.commodity) {
          const hasMatch = txn.postings.some(p => p.commodity === filter.commodity)
          if (!hasMatch) return false
        }

        if (filter.description) {
          if (!txn.description.toLowerCase().includes(filter.description.toLowerCase())) {
            return false
          }
        }

        return true
      })

      if (filter.offset) {
        result = result.slice(filter.offset)
      }

      if (filter.limit) {
        result = result.slice(0, filter.limit)
      }
    }

    return result
  }

  async getTransaction(id: string): Promise<Transaction | null> {
    const transactions = await this.loadTransactions()
    return transactions.find(t => t.id === id) ?? null
  }

  async appendTransactions(transactions: Transaction[]): Promise<Transaction[]> {
    // Read current content (keep for potential rollback if needed)
    const originalContent = await this.fileProvider.read(this.journalPath)

    // Generate IDs for new transactions if needed
    const newTransactions = transactions.map((txn, idx) => {
      if (txn.id && !txn.id.includes('-')) {
        return txn
      }
      const idBase = `${txn.date.toISOString().split('T')[0]}-${idx}-${Date.now()}`
      return txn.withId(idBase)
    })

    // Append to journal
    const newContent = this.writer.appendToJournal(originalContent, newTransactions, [])

    // Write file (FileProvider handles atomic write)
    await this.fileProvider.write(this.journalPath, newContent)

    // Invalidate cache
    this.cachedTransactions = null

    return newTransactions
  }

  async existsExternalId(externalId: string): Promise<boolean> {
    const transactions = await this.loadTransactions()
    return transactions.some(t => t.externalId === externalId)
  }

  async listAccounts(): Promise<string[]> {
    const transactions = await this.loadTransactions()
    const accounts = new Set<string>()

    for (const txn of transactions) {
      for (const posting of txn.postings) {
        accounts.add(posting.account.name)
      }
    }

    return Array.from(accounts).sort()
  }

  async listCommodities(): Promise<string[]> {
    const transactions = await this.loadTransactions()
    const commodities = new Set<string>()

    for (const txn of transactions) {
      for (const posting of txn.postings) {
        commodities.add(posting.commodity)
      }
    }

    return Array.from(commodities).sort()
  }

  private async loadTransactions(): Promise<Transaction[]> {
    const head = await this.getHead()

    if (this.cachedTransactions && this.cacheVersion === head.version) {
      return this.cachedTransactions
    }

    const content = await this.fileProvider.read(this.journalPath)
    const ast = this.parser.parse(content)

    const transactions: Transaction[] = []

    for (const entry of ast.entries) {
      if (entry.type === 'transaction') {
        try {
          const txn = this.nodeToTransaction(entry)
          transactions.push(txn)
        } catch (e) {
          // Skip invalid transactions
          console.warn(`Skipping invalid transaction at line ${entry.lineNumber}: ${e}`)
        }
      }
    }

    this.cachedTransactions = transactions
    this.cacheVersion = head.version

    return transactions
  }

  private nodeToTransaction(node: TransactionNode): Transaction {
    const date = this.parseDate(node.date)

    // Separate postings with and without amounts
    const postingsWithAmount = node.postings.filter(p => p.amount)
    const postingsWithoutAmount = node.postings.filter(p => !p.amount)

    // Ledger allows at most one elided posting
    if (postingsWithoutAmount.length > 1) {
      throw new Error('Only one posting may have an elided amount')
    }

    // Convert postings with explicit amounts
    const postings: Posting[] = postingsWithAmount.map(p => this.nodeToPosting(p))

    // Calculate implicit amounts for the elided posting (if any)
    if (postingsWithoutAmount.length === 1) {
      const elidedPosting = postingsWithoutAmount[0]
      const elidedAccount = new Account({ name: elidedPosting.account })

      // Calculate sum per commodity from explicit postings
      const commoditySums = new Map<string, Decimal>()
      for (const p of postings) {
        const current = commoditySums.get(p.commodity) ?? new Decimal(0)
        commoditySums.set(p.commodity, current.plus(p.quantity))
      }

      // The elided posting receives the negation of each commodity's sum
      for (const [commodity, sum] of commoditySums) {
        if (!sum.isZero()) {
          postings.push(new Posting({
            account: elidedAccount,
            amount: new Money({
              quantity: sum.negated(),
              commodity
            }),
            comment: elidedPosting.comment
          }))
        }
      }
    }

    // Parse externalId from comment if present
    let externalId: string | undefined
    let comment = node.comment

    if (comment) {
      const extIdMatch = comment.match(/extid:(\S+)/)
      if (extIdMatch) {
        externalId = extIdMatch[1]
        comment = comment.replace(/extid:\S+\s*/, '').trim() || undefined
      }
    }

    return new Transaction({
      id: `${node.date}-${node.lineNumber}`,
      date,
      description: node.description,
      postings,
      comment,
      externalId
    })
  }

  private nodeToPosting(node: PostingNode): Posting {
    if (!node.amount) {
      throw new Error('Posting must have an amount')
    }

    const quantity = new Decimal(node.amount.quantity)
    const finalQuantity = node.amount.isNegative ? quantity.negated() : quantity

    return new Posting({
      account: new Account({ name: node.account }),
      amount: new Money({
        quantity: finalQuantity,
        commodity: node.amount.commodity
      }),
      comment: node.comment
    })
  }

  private parseDate(dateStr: string): Date {
    const normalized = dateStr.replace(/\//g, '-')
    return new Date(normalized + 'T00:00:00.000Z')
  }
}
