export type AccountKind = 'asset' | 'liability' | 'equity' | 'income' | 'expense'

export interface AccountProps {
  name: string
  kind?: AccountKind
}

const KIND_PREFIXES: Record<string, AccountKind> = {
  'Assets': 'asset',
  'Liabilities': 'liability',
  'Equity': 'equity',
  'Income': 'income',
  'Expenses': 'expense',
  'Expense': 'expense'
}

export class Account {
  readonly name: string
  readonly kind: AccountKind
  readonly segments: string[]

  constructor(props: AccountProps) {
    if (!props.name || props.name.trim() === '') {
      throw new Error('Account name cannot be empty')
    }

    this.name = props.name
    this.segments = props.name.split(':')
    this.kind = props.kind ?? this.inferKind()
  }

  private inferKind(): AccountKind {
    const topLevel = this.segments[0]
    return KIND_PREFIXES[topLevel] ?? 'asset'
  }

  get depth(): number {
    return this.segments.length
  }

  get parent(): Account | null {
    if (this.segments.length <= 1) {
      return null
    }
    return new Account({
      name: this.segments.slice(0, -1).join(':'),
      kind: this.kind
    })
  }

  get root(): string {
    return this.segments[0]
  }

  get leaf(): string {
    return this.segments[this.segments.length - 1]
  }

  isDescendantOf(ancestor: Account): boolean {
    if (this.segments.length <= ancestor.segments.length) {
      return false
    }
    return ancestor.segments.every((seg, i) => this.segments[i] === seg)
  }

  isAncestorOf(descendant: Account): boolean {
    return descendant.isDescendantOf(this)
  }

  matchesPattern(pattern: string): boolean {
    // Support wildcards: * matches one segment, ** matches any number
    const patternSegments = pattern.split(':')
    return this.matchSegments(this.segments, patternSegments)
  }

  private matchSegments(segments: string[], patterns: string[]): boolean {
    let si = 0
    let pi = 0

    while (si < segments.length && pi < patterns.length) {
      const pattern = patterns[pi]

      if (pattern === '**') {
        // ** at end matches everything remaining
        if (pi === patterns.length - 1) {
          return true
        }
        // Try matching ** with 0, 1, 2, ... segments
        for (let skip = 0; skip <= segments.length - si; skip++) {
          if (this.matchSegments(segments.slice(si + skip), patterns.slice(pi + 1))) {
            return true
          }
        }
        return false
      } else if (pattern === '*') {
        // * matches exactly one segment
        si++
        pi++
      } else if (pattern === segments[si]) {
        si++
        pi++
      } else {
        return false
      }
    }

    // Handle trailing **
    while (pi < patterns.length && patterns[pi] === '**') {
      pi++
    }

    return si === segments.length && pi === patterns.length
  }

  equals(other: Account): boolean {
    return this.name === other.name
  }

  toString(): string {
    return this.name
  }
}
