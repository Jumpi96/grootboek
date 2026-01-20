import { Lexer, Token, TokenType } from './lexer.js'
import {
  JournalAST,
  JournalEntry,
  TransactionNode,
  PostingNode,
  PriceNode,
  CommentNode,
  AmountNode
} from './ast.js'

export class ParseError extends Error {
  constructor(
    message: string,
    public readonly line: number,
    public readonly column: number
  ) {
    super(`${message} at line ${line}, column ${column}`)
    this.name = 'ParseError'
  }
}

export class Parser {
  private tokens: Token[] = []
  private pos: number = 0

  parse(input: string): JournalAST {
    const lexer = new Lexer(input)
    this.tokens = lexer.tokenize()
    this.pos = 0

    const entries: JournalEntry[] = []

    while (!this.isAtEnd()) {
      this.skipNewlines()
      if (this.isAtEnd()) break

      const entry = this.parseEntry()
      if (entry) {
        entries.push(entry)
      }
    }

    return { entries }
  }

  private parseEntry(): JournalEntry | null {
    // Skip leading comments on their own line
    if (this.check(TokenType.COMMENT)) {
      const comment = this.parseStandaloneComment()
      return comment
    }

    // Price directive
    if (this.check(TokenType.PRICE_DIRECTIVE)) {
      return this.parsePriceDirective()
    }

    // Transaction (starts with date)
    if (this.check(TokenType.DATE)) {
      return this.parseTransaction()
    }

    // Skip unknown lines
    this.skipLine()
    return null
  }

  private parseStandaloneComment(): CommentNode {
    const token = this.advance()
    return {
      type: 'comment',
      text: token.value.replace(/^;+\s*/, ''),
      lineNumber: token.line
    }
  }

  private parsePriceDirective(): PriceNode {
    const startToken = this.advance() // consume P
    const lineNumber = startToken.line

    // Date
    if (!this.check(TokenType.DATE)) {
      throw new ParseError('Expected date after P', this.currentLine(), this.currentColumn())
    }
    const date = this.advance().value

    // Base commodity (can be quoted or regular)
    const baseCommodity = this.parseCommoditySymbol()

    // Quote commodity and price
    // Format: QUOTE_COMMODITY PRICE or just PRICE if quote is $
    let quoteCommodity: string
    let price: string

    if (this.check(TokenType.COMMODITY) && this.peek().value === '$') {
      quoteCommodity = this.advance().value
      price = this.parseNumberValue()
    } else if (this.check(TokenType.COMMODITY) || this.check(TokenType.QUOTED_COMMODITY)) {
      quoteCommodity = this.parseCommoditySymbol()
      price = this.parseNumberValue()
    } else if (this.check(TokenType.NUMBER) || this.check(TokenType.MINUS)) {
      // Assume $ as quote commodity
      quoteCommodity = '$'
      price = this.parseNumberValue()
    } else {
      throw new ParseError('Expected quote commodity or price', this.currentLine(), this.currentColumn())
    }

    // Optional comment
    let comment: string | undefined
    if (this.check(TokenType.COMMENT)) {
      comment = this.advance().value.replace(/^;+\s*/, '')
    }

    this.skipToEndOfLine()

    return {
      type: 'price',
      date,
      baseCommodity,
      quoteCommodity,
      price,
      comment,
      lineNumber
    }
  }

  private parseTransaction(): TransactionNode {
    const dateToken = this.advance()
    const date = dateToken.value
    const lineNumber = dateToken.line

    // Description - rest of line until comment or newline
    let description = ''
    let comment: string | undefined

    while (!this.isAtEnd() &&
           !this.check(TokenType.NEWLINE) &&
           !this.check(TokenType.COMMENT)) {
      const token = this.advance()
      if (token.type === TokenType.TEXT ||
          token.type === TokenType.COMMODITY ||
          token.type === TokenType.NUMBER ||
          token.type === TokenType.DATE) {
        description += (description ? ' ' : '') + token.value
      }
    }

    if (this.check(TokenType.COMMENT)) {
      comment = this.advance().value.replace(/^;+\s*/, '')
    }

    this.skipNewlines()

    // Parse postings
    const postings: PostingNode[] = []

    while (this.check(TokenType.INDENT)) {
      const posting = this.parsePosting()
      if (posting) {
        postings.push(posting)
      }
      this.skipNewlines()
    }

    return {
      type: 'transaction',
      date,
      description: description.trim(),
      postings,
      comment,
      lineNumber
    }
  }

  private parsePosting(): PostingNode | null {
    const indentToken = this.advance() // consume indent
    const lineNumber = indentToken.line

    // Check for empty line or comment-only line
    if (this.check(TokenType.NEWLINE) || this.check(TokenType.EOF)) {
      return null
    }

    if (this.check(TokenType.COMMENT)) {
      this.advance()
      return null
    }

    // Account name
    if (!this.check(TokenType.ACCOUNT) && !this.check(TokenType.COMMODITY)) {
      this.skipLine()
      return null
    }

    let account = this.advance().value

    // Some accounts might be split across tokens if they contain numbers
    while (this.check(TokenType.COMMODITY) || this.check(TokenType.ACCOUNT)) {
      const next = this.peek()
      // Only continue if this looks like part of an account name
      if (next.value.includes(':')) {
        account += this.advance().value
      } else {
        break
      }
    }

    // Optional amount
    let amount: AmountNode | undefined

    // Look for amount - could be: $ 123, -$ 123, SYMBOL 123, 123 SYMBOL, "QUOTED" 123
    if (this.check(TokenType.MINUS) ||
        this.check(TokenType.COMMODITY) ||
        this.check(TokenType.QUOTED_COMMODITY) ||
        this.check(TokenType.NUMBER)) {
      amount = this.parseAmount()
    }

    // Optional comment
    let comment: string | undefined
    if (this.check(TokenType.COMMENT)) {
      comment = this.advance().value.replace(/^;+\s*/, '')
    }

    this.skipToEndOfLine()

    return {
      type: 'posting',
      account,
      amount,
      comment,
      lineNumber
    }
  }

  private parseAmount(): AmountNode {
    let isNegative = false
    let commodity: string
    let quantity: string
    let commodityPosition: 'prefix' | 'suffix' = 'prefix'

    // Handle leading minus
    if (this.check(TokenType.MINUS)) {
      isNegative = true
      this.advance()
    }

    // Handle -$ format
    if (this.check(TokenType.COMMODITY) && this.peek().value === '$') {
      commodity = this.advance().value
      quantity = this.parseNumberValue()
      commodityPosition = 'prefix'
    } else if (this.check(TokenType.COMMODITY) || this.check(TokenType.QUOTED_COMMODITY)) {
      // SYMBOL 123 or "QUOTED" 123
      commodity = this.parseCommoditySymbol()

      if (this.check(TokenType.NUMBER) || this.check(TokenType.MINUS)) {
        quantity = this.parseNumberValue()
        commodityPosition = 'prefix'
      } else {
        // Might be suffix format: 123 SYMBOL
        throw new ParseError('Expected number after commodity', this.currentLine(), this.currentColumn())
      }
    } else if (this.check(TokenType.NUMBER)) {
      // Number first: 123 SYMBOL or 123.45
      quantity = this.parseNumberValue()

      if (this.check(TokenType.COMMODITY) || this.check(TokenType.QUOTED_COMMODITY)) {
        commodity = this.parseCommoditySymbol()
        commodityPosition = 'suffix'
      } else {
        // Default to $ if no commodity specified
        commodity = '$'
        commodityPosition = 'prefix'
      }
    } else {
      throw new ParseError('Expected amount', this.currentLine(), this.currentColumn())
    }

    // Handle negative quantity in the number itself
    if (quantity.startsWith('-')) {
      isNegative = !isNegative // double negative = positive
      quantity = quantity.slice(1)
    }

    return {
      quantity,
      commodity,
      isNegative,
      commodityPosition
    }
  }

  private parseCommoditySymbol(): string {
    if (this.check(TokenType.QUOTED_COMMODITY)) {
      const value = this.advance().value
      // Remove quotes for internal representation
      return value.slice(1, -1)
    }
    if (this.check(TokenType.COMMODITY)) {
      return this.advance().value
    }
    throw new ParseError('Expected commodity symbol', this.currentLine(), this.currentColumn())
  }

  private parseNumberValue(): string {
    let value = ''

    if (this.check(TokenType.MINUS)) {
      value = '-'
      this.advance()
    }

    if (this.check(TokenType.NUMBER)) {
      value += this.advance().value
    } else {
      throw new ParseError('Expected number', this.currentLine(), this.currentColumn())
    }

    return value
  }

  private skipNewlines(): void {
    while (this.check(TokenType.NEWLINE)) {
      this.advance()
    }
  }

  private skipLine(): void {
    while (!this.isAtEnd() && !this.check(TokenType.NEWLINE)) {
      this.advance()
    }
    if (this.check(TokenType.NEWLINE)) {
      this.advance()
    }
  }

  private skipToEndOfLine(): void {
    while (!this.isAtEnd() && !this.check(TokenType.NEWLINE)) {
      this.advance()
    }
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false
    return this.peek().type === type
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.pos++
    return this.previous()
  }

  private peek(): Token {
    return this.tokens[this.pos]
  }

  private previous(): Token {
    return this.tokens[this.pos - 1]
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF
  }

  private currentLine(): number {
    return this.peek().line
  }

  private currentColumn(): number {
    return this.peek().column
  }
}
