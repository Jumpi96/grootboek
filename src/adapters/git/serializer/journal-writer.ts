import { Transaction } from '../../../core/domain/transaction.js'
import { Price } from '../../../core/domain/price.js'
import { Posting } from '../../../core/domain/posting.js'

export interface JournalWriterOptions {
  dateFormat?: 'slash' | 'dash'
  amountAlignment?: number
  indentSize?: number
}

export class JournalWriter {
  private readonly dateFormat: 'slash' | 'dash'
  private readonly amountAlignment: number
  private readonly indentSize: number

  constructor(options: JournalWriterOptions = {}) {
    this.dateFormat = options.dateFormat ?? 'slash'
    this.amountAlignment = options.amountAlignment ?? 50
    this.indentSize = options.indentSize ?? 2
  }

  writeTransaction(transaction: Transaction): string {
    const lines: string[] = []

    // Header line: date + description
    const dateStr = this.formatDate(transaction.date)
    let header = `${dateStr} ${transaction.description}`

    // Add comment with optional externalId metadata
    const commentParts: string[] = []
    if (transaction.externalId) {
      commentParts.push(`extid:${transaction.externalId}`)
    }
    if (transaction.comment) {
      commentParts.push(transaction.comment)
    }
    if (commentParts.length > 0) {
      header += ` ; ${commentParts.join(' ')}`
    }
    lines.push(header)

    // Postings
    for (const posting of transaction.postings) {
      lines.push(this.writePosting(posting))
    }

    return lines.join('\n')
  }

  writePrice(price: Price): string {
    const dateStr = this.formatDate(price.date)
    const baseCommodity = this.formatCommodity(price.baseCommodity)
    const quoteCommodity = this.formatCommodity(price.quoteCommodity)

    let line = `P ${dateStr} ${baseCommodity} ${quoteCommodity} ${price.price.toString()}`

    if (price.comment) {
      line += ` ;; ${price.comment}`
    }

    return line
  }

  writePosting(posting: Posting): string {
    const indent = ' '.repeat(this.indentSize)
    const account = posting.account.name

    // Format amount
    const amountStr = this.formatAmount(posting)

    // Calculate padding for alignment
    const baseLength = indent.length + account.length
    const padding = Math.max(4, this.amountAlignment - baseLength)

    return `${indent}${account}${' '.repeat(padding)}${amountStr}`
  }

  private formatAmount(posting: Posting): string {
    const quantity = posting.amount.quantity
    const commodity = posting.commodity

    // Handle $ as prefix
    if (commodity === '$') {
      if (quantity.isNegative()) {
        return `-$ ${quantity.abs().toString()}`
      }
      return `$ ${quantity.toString()}`
    }

    // Handle quoted commodities (if contains non-alphanumeric)
    const formattedCommodity = this.formatCommodity(commodity)

    // Other commodities as suffix
    return `${formattedCommodity} ${quantity.toString()}`
  }

  private formatCommodity(commodity: string): string {
    // Quote if contains special characters
    if (/[^A-Za-z0-9_-]/.test(commodity) || /^\d/.test(commodity)) {
      return `"${commodity}"`
    }
    return commodity
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')

    const separator = this.dateFormat === 'slash' ? '/' : '-'
    return `${year}${separator}${month}${separator}${day}`
  }

  writeEntries(
    transactions: Transaction[],
    prices: Price[]
  ): string {
    const lines: string[] = []

    // Group by date for interleaving
    const allEntries: Array<{ date: Date; type: 'transaction' | 'price'; entry: Transaction | Price }> = []

    for (const txn of transactions) {
      allEntries.push({ date: txn.date, type: 'transaction', entry: txn })
    }

    for (const price of prices) {
      allEntries.push({ date: price.date, type: 'price', entry: price })
    }

    // Sort by date
    allEntries.sort((a, b) => a.date.getTime() - b.date.getTime())

    for (const { type, entry } of allEntries) {
      if (type === 'transaction') {
        lines.push(this.writeTransaction(entry as Transaction))
      } else {
        lines.push(this.writePrice(entry as Price))
      }
      lines.push('')
    }

    return lines.join('\n')
  }

  appendToJournal(
    existingContent: string,
    newTransactions: Transaction[],
    newPrices: Price[] = []
  ): string {
    const newContent = this.writeEntries(newTransactions, newPrices)

    // Ensure existing content ends with newline
    let result = existingContent.trimEnd()
    if (result.length > 0) {
      result += '\n\n'
    }
    result += newContent

    return result
  }
}
