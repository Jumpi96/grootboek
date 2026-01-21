import * as fs from 'node:fs/promises'
import * as path from 'node:path'
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
import { Parser } from './parser/parser.js'
import { TransactionNode, PostingNode } from './parser/ast.js'
import { JournalWriter } from './serializer/journal-writer.js'
import { GitClient } from './git-client.js'

export interface GitLedgerRepositoryOptions {
  journalPath: string
  gitClient?: GitClient
  autoCommit?: boolean
  commitMessage?: (txns: Transaction[]) => string
}

export class GitLedgerRepository implements LedgerRepository {
  private readonly journalPath: string
  private readonly gitClient?: GitClient
  private readonly autoCommit: boolean
  private readonly commitMessage: (txns: Transaction[]) => string
  private readonly parser: Parser
  private readonly writer: JournalWriter

  private cachedTransactions: Transaction[] | null = null
  private cacheVersion: string | null = null

  constructor(options: GitLedgerRepositoryOptions) {
    this.journalPath = path.resolve(options.journalPath)
    this.gitClient = options.gitClient
    this.autoCommit = options.autoCommit ?? false
    this.commitMessage = options.commitMessage ??
      ((txns) => `Add ${txns.length} transaction(s)`)
    this.parser = new Parser()
    this.writer = new JournalWriter()
  }

  async getHead(): Promise<HeadInfo> {
    const stat = await fs.stat(this.journalPath).catch(() => null)

    let commitHash: string | undefined
    let lastModified: Date | undefined

    if (this.gitClient) {
      commitHash = (await this.gitClient.getCurrentCommitHash()) ?? undefined
    }

    if (stat) {
      lastModified = stat.mtime
    }

    return {
      version: commitHash ?? stat?.mtime.toISOString() ?? 'unknown',
      commitHash,
      lastModified
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
    // Read current content (keep for rollback)
    const originalContent = await this.readJournalFile()

    // Generate IDs for new transactions if needed
    const newTransactions = transactions.map((txn, idx) => {
      if (txn.id && !txn.id.includes('-')) {
        return txn
      }
      // Generate a deterministic ID based on content
      const idBase = `${txn.date.toISOString().split('T')[0]}-${idx}`
      return txn.withId(idBase)
    })

    // Append to journal
    const newContent = this.writer.appendToJournal(originalContent, newTransactions, [])

    // Write to temp file first, then rename (atomic on most filesystems)
    const tempPath = `${this.journalPath}.tmp`

    try {
      await fs.writeFile(tempPath, newContent, 'utf-8')
      await fs.rename(tempPath, this.journalPath)

      // Invalidate cache
      this.cachedTransactions = null

      // Auto-commit if enabled
      if (this.autoCommit && this.gitClient) {
        try {
          await this.gitClient.stageFile(this.journalPath)
          await this.gitClient.commit(this.commitMessage(newTransactions))
        } catch (gitError) {
          // Git commit failed - restore original file
          await fs.writeFile(this.journalPath, originalContent, 'utf-8')
          this.cachedTransactions = null
          throw new Error(`Git commit failed, changes rolled back: ${gitError}`)
        }
      }

      return newTransactions
    } catch (e) {
      // Clean up temp file if it exists
      await fs.unlink(tempPath).catch(() => {})
      throw e
    }
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

    const content = await this.readJournalFile()
    const ast = this.parser.parse(content)

    const transactions: Transaction[] = []

    for (const entry of ast.entries) {
      if (entry.type === 'transaction') {
        try {
          const txn = this.nodeToTransaction(entry)
          transactions.push(txn)
        } catch (e) {
          // Skip invalid transactions but log warning
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
    // Convert YYYY/MM/DD or YYYY-MM-DD to Date
    const normalized = dateStr.replace(/\//g, '-')
    return new Date(normalized + 'T00:00:00.000Z')
  }

  private async readJournalFile(): Promise<string> {
    try {
      return await fs.readFile(this.journalPath, 'utf-8')
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        return ''
      }
      throw e
    }
  }
}
