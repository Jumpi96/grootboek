import { Decimal } from '../../core/utils/decimal.js'
import { Price } from '../../core/domain/price.js'
import { PriceRepository, PriceFilter } from '../../core/ports/price-repository.js'
import { Parser } from '../git/parser/parser.js'
import { PriceNode } from '../git/parser/ast.js'
import { JournalWriter } from '../git/serializer/journal-writer.js'
import { FileProvider, NodeFileProvider } from './file-provider.js'

export interface FilePriceRepositoryOptions {
  /**
   * Path to the journal file
   */
  journalPath: string

  /**
   * File provider implementation.
   * Defaults to NodeFileProvider for Node.js environments.
   */
  fileProvider?: FileProvider
}

export class FilePriceRepository implements PriceRepository {
  private readonly journalPath: string
  private readonly fileProvider: FileProvider
  private readonly parser: Parser
  private readonly writer: JournalWriter

  private cachedPrices: Price[] | null = null
  private cacheVersion: string | null = null

  constructor(options: FilePriceRepositoryOptions) {
    this.journalPath = options.journalPath
    this.fileProvider = options.fileProvider ?? new NodeFileProvider()
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

      const latestInverse = inverseCandidates.reduce((a, b) =>
        a.date > b.date ? a : b
      )
      return latestInverse.invert()
    }

    return candidates.reduce((a, b) => a.date > b.date ? a : b)
  }

  async upsertPrices(prices: Price[]): Promise<void> {
    const content = await this.fileProvider.read(this.journalPath)
    const newContent = this.writer.appendToJournal(content, [], prices)

    await this.fileProvider.write(this.journalPath, newContent)

    // Invalidate cache
    this.cachedPrices = null
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
    const stat = await this.fileProvider.stat(this.journalPath)
    const version = stat?.lastModified.toISOString() ?? 'empty'

    if (this.cachedPrices && this.cacheVersion === version) {
      return this.cachedPrices
    }

    const content = await this.fileProvider.read(this.journalPath)
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
    this.cacheVersion = version

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
}
