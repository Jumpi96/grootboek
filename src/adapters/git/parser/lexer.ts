export enum TokenType {
  DATE = 'DATE',
  TEXT = 'TEXT',
  ACCOUNT = 'ACCOUNT',
  NUMBER = 'NUMBER',
  COMMODITY = 'COMMODITY',
  QUOTED_COMMODITY = 'QUOTED_COMMODITY',
  PRICE_DIRECTIVE = 'PRICE_DIRECTIVE',
  COMMENT = 'COMMENT',
  NEWLINE = 'NEWLINE',
  INDENT = 'INDENT',
  MINUS = 'MINUS',
  EOF = 'EOF'
}

export interface Token {
  type: TokenType
  value: string
  line: number
  column: number
}

export class Lexer {
  private input: string
  private pos: number = 0
  private line: number = 1
  private column: number = 1
  private tokens: Token[] = []

  constructor(input: string) {
    this.input = input
  }

  tokenize(): Token[] {
    this.tokens = []
    this.pos = 0
    this.line = 1
    this.column = 1

    while (this.pos < this.input.length) {
      this.scanToken()
    }

    this.tokens.push({
      type: TokenType.EOF,
      value: '',
      line: this.line,
      column: this.column
    })

    return this.tokens
  }

  private scanToken(): void {
    const char = this.input[this.pos]

    // Handle newlines
    if (char === '\n') {
      this.addToken(TokenType.NEWLINE, '\n')
      this.pos++
      this.line++
      this.column = 1
      return
    }

    // Handle carriage return
    if (char === '\r') {
      this.pos++
      return
    }

    // Handle indentation at start of line (spaces or tabs)
    if (this.column === 1 && (char === ' ' || char === '\t')) {
      let indent = ''
      while (this.pos < this.input.length &&
             (this.input[this.pos] === ' ' || this.input[this.pos] === '\t')) {
        indent += this.input[this.pos]
        this.pos++
        this.column++
      }
      this.addToken(TokenType.INDENT, indent)
      return
    }

    // Skip spaces (not at start of line, not indentation)
    if (char === ' ' || char === '\t') {
      this.pos++
      this.column++
      return
    }

    // Handle comments
    if (char === ';') {
      let comment = ''
      while (this.pos < this.input.length && this.input[this.pos] !== '\n') {
        comment += this.input[this.pos]
        this.pos++
        this.column++
      }
      this.addToken(TokenType.COMMENT, comment)
      return
    }

    // Handle price directive
    if (char === 'P' && this.column === 1 && this.peek(1) === ' ') {
      this.addToken(TokenType.PRICE_DIRECTIVE, 'P')
      this.pos++
      this.column++
      return
    }

    // Handle date at start of line (YYYY/MM/DD or YYYY-MM-DD)
    if (this.isDateStart()) {
      const date = this.scanDate()
      if (date) {
        this.addToken(TokenType.DATE, date)
        return
      }
    }

    // Handle quoted commodity like "AY24"
    if (char === '"') {
      const quoted = this.scanQuotedCommodity()
      this.addToken(TokenType.QUOTED_COMMODITY, quoted)
      return
    }

    // Handle minus sign
    if (char === '-') {
      // Check if it's followed by a number or $ sign
      const next = this.peek(1)
      if (next === '$' || this.isDigit(next)) {
        this.addToken(TokenType.MINUS, '-')
        this.pos++
        this.column++
        return
      }
    }

    // Handle currency symbol (like $)
    if (char === '$') {
      this.addToken(TokenType.COMMODITY, '$')
      this.pos++
      this.column++
      return
    }

    // Handle number
    if (this.isDigit(char) || (char === '-' && this.isDigit(this.peek(1)))) {
      const number = this.scanNumber()
      this.addToken(TokenType.NUMBER, number)
      return
    }

    // Handle account or commodity (identifier-like)
    if (this.isIdentifierStart(char)) {
      const identifier = this.scanIdentifier()

      // Check if it's an account (contains :)
      if (identifier.includes(':')) {
        this.addToken(TokenType.ACCOUNT, identifier)
      } else {
        // Could be a commodity or part of description
        this.addToken(TokenType.COMMODITY, identifier)
      }
      return
    }

    // Default: treat as text
    const text = this.scanText()
    this.addToken(TokenType.TEXT, text)
  }

  private isDateStart(): boolean {
    // Check if we're at a position that could be start of date
    // Look for pattern: digit digit digit digit / or -
    if (this.pos + 4 >= this.input.length) return false

    const slice = this.input.slice(this.pos, this.pos + 5)
    return /^\d{4}[/-]/.test(slice)
  }

  private scanDate(): string | null {
    const start = this.pos
    let date = ''

    // Year
    for (let i = 0; i < 4 && this.isDigit(this.input[this.pos]); i++) {
      date += this.input[this.pos]
      this.pos++
      this.column++
    }

    // Separator
    if (this.input[this.pos] === '/' || this.input[this.pos] === '-') {
      date += this.input[this.pos]
      this.pos++
      this.column++
    } else {
      this.pos = start
      this.column -= date.length
      return null
    }

    // Month
    for (let i = 0; i < 2 && this.isDigit(this.input[this.pos]); i++) {
      date += this.input[this.pos]
      this.pos++
      this.column++
    }

    // Separator
    if (this.input[this.pos] === '/' || this.input[this.pos] === '-') {
      date += this.input[this.pos]
      this.pos++
      this.column++
    } else {
      this.pos = start
      this.column -= date.length
      return null
    }

    // Day
    for (let i = 0; i < 2 && this.isDigit(this.input[this.pos]); i++) {
      date += this.input[this.pos]
      this.pos++
      this.column++
    }

    return date
  }

  private scanQuotedCommodity(): string {
    let value = '"'
    this.pos++ // skip opening quote
    this.column++

    while (this.pos < this.input.length && this.input[this.pos] !== '"') {
      value += this.input[this.pos]
      this.pos++
      this.column++
    }

    if (this.input[this.pos] === '"') {
      value += '"'
      this.pos++
      this.column++
    }

    return value
  }

  private scanNumber(): string {
    let number = ''

    // Handle negative sign
    if (this.input[this.pos] === '-') {
      number += '-'
      this.pos++
      this.column++
    }

    // Integer part
    while (this.isDigit(this.input[this.pos])) {
      number += this.input[this.pos]
      this.pos++
      this.column++
    }

    // Decimal part
    if (this.input[this.pos] === '.') {
      number += '.'
      this.pos++
      this.column++

      while (this.isDigit(this.input[this.pos])) {
        number += this.input[this.pos]
        this.pos++
        this.column++
      }
    }

    return number
  }

  private scanIdentifier(): string {
    let identifier = ''

    while (this.pos < this.input.length && this.isIdentifierChar(this.input[this.pos])) {
      identifier += this.input[this.pos]
      this.pos++
      this.column++
    }

    return identifier
  }

  private scanText(): string {
    let text = ''

    while (this.pos < this.input.length) {
      const char = this.input[this.pos]
      if (char === '\n' || char === ';') break
      text += char
      this.pos++
      this.column++
    }

    return text.trim()
  }

  private isDigit(char: string): boolean {
    return char >= '0' && char <= '9'
  }

  private isIdentifierStart(char: string): boolean {
    return (char >= 'a' && char <= 'z') ||
           (char >= 'A' && char <= 'Z') ||
           char === '_'
  }

  private isIdentifierChar(char: string): boolean {
    return this.isIdentifierStart(char) ||
           this.isDigit(char) ||
           char === ':' ||
           char === '_' ||
           char === '-'
  }

  private peek(offset: number): string {
    const pos = this.pos + offset
    if (pos >= this.input.length) return '\0'
    return this.input[pos]
  }

  private addToken(type: TokenType, value: string): void {
    this.tokens.push({
      type,
      value,
      line: this.line,
      column: this.column - value.length
    })
  }
}
