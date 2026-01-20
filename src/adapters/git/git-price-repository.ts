import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { Decimal } from '../../core/utils/decimal.js'
import { Price } from '../../core/domain/price.js'
import { PriceRepository, PriceFilter } from '../../core/ports/price-repository.js'
import { Parser } from './parser/parser.js'
import { PriceNode } from './parser/ast.js'
import { JournalWriter } from './serializer/journal-writer.js'
import { GitClient } from './git-client.js'

export interface GitPriceRepositoryOptions {
  journalPath: string
  gitClient?: GitClient
  autoCommit?: boolean
}

export class GitPriceRepository implements PriceRepository {
  private readonly journalPath: string
  private readonly gitClient?: GitClient
  private readonly autoCommit: boolean
  private readonly parser: Parser
  private readonly writer: JournalWriter

  private cachedPrices: Price[] | null = null
  private cacheModTime: number | null = null

  constructor(options: GitPriceRepositoryOptions) {
    this.journalPath = path.resolve(options.journalPath)
    this.gitClient = options.gitClient
    this.autoCommit = options.autoCommit ?? false
    this.parser = new Parser()
    this.writer = new JournalWriter()
  }

  async listPrices(filter?: PriceFilter): Promise<Price[]> {
    const prices = await this.loadPrices()

    let result = prices

    if (filter) {
      result = result.filter((price) => {
        if (filter.baseCommodity && price.baseCommodity !== filter.baseCommodity) {
          return false
        }
        if (filter.quoteCommodity && price.quoteCommodity !== filter.quoteCommodity) {
          return false
        }
        if (filter.fromDate && price.date < filter.fromDate) {
          return false
        }
        if (filter.toDate && price.date > filter.toDate) {
          return false
        }
        return true
      })
    }

    return result
  }

  async getPrice(
    baseCommodity: string,
    quoteCommodity: string,
    asOfDate?: Date
  ): Promise<Price | null> {
    const prices = await this.loadPrices()

    // Find the latest price for this pair on or before asOfDate
    const targetDate = asOfDate ?? new Date()

    const candidates = prices.filter(
      p => p.baseCommodity === baseCommodity &&
           p.quoteCommodity === quoteCommodity &&
           p.date <= targetDate
    )

    if (candidates.length === 0) {
      // Try inverse
      const inverseCandidates = prices.filter(
        p => p.baseCommodity === quoteCommodity &&
             p.quoteCommodity === baseCommodity &&
             p.date <= targetDate
      )

      if (inverseCandidates.length === 0) {
        return null
      }

      // Return the latest inverse, inverted
      const latestInverse = inverseCandidates.reduce((a, b) =>
        a.date > b.date ? a : b
      )
      return latestInverse.invert()
    }

    // Return the latest
    return candidates.reduce((a, b) => a.date > b.date ? a : b)
  }

  async upsertPrices(prices: Price[]): Promise<void> {
    // For git adapter, we append new prices rather than updating
    // (since the file is append-only)
    const content = await this.readJournalFile()

    // Append prices
    const newContent = this.writer.appendToJournal(content, [], prices)

    await fs.writeFile(this.journalPath, newContent, 'utf-8')

    // Invalidate cache
    this.cachedPrices = null

    // Auto-commit if enabled
    if (this.autoCommit && this.gitClient) {
      await this.gitClient.stageFile(this.journalPath)
      await this.gitClient.commit(`Add ${prices.length} price(s)`)
    }
  }

  async listBaseCommodities(): Promise<string[]> {
    const prices = await this.loadPrices()
    const commodities = new Set<string>()

    for (const price of prices) {
      commodities.add(price.baseCommodity)
    }

    return Array.from(commodities).sort()
  }

  private async loadPrices(): Promise<Price[]> {
    const stat = await fs.stat(this.journalPath).catch(() => null)
    const modTime = stat?.mtimeMs ?? 0

    if (this.cachedPrices && this.cacheModTime === modTime) {
      return this.cachedPrices
    }

    const content = await this.readJournalFile()
    const ast = this.parser.parse(content)

    const prices: Price[] = []

    for (const entry of ast.entries) {
      if (entry.type === 'price') {
        try {
          const price = this.nodeToPrice(entry)
          prices.push(price)
        } catch (e) {
          console.warn(`Skipping invalid price at line ${entry.lineNumber}: ${e}`)
        }
      }
    }

    this.cachedPrices = prices
    this.cacheModTime = modTime

    return prices
  }

  private nodeToPrice(node: PriceNode): Price {
    return new Price({
      date: this.parseDate(node.date),
      baseCommodity: node.baseCommodity,
      quoteCommodity: node.quoteCommodity,
      price: new Decimal(node.price),
      comment: node.comment
    })
  }

  private parseDate(dateStr: string): Date {
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
