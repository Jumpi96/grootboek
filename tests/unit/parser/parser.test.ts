import { describe, it, expect } from 'vitest'
import { Parser } from '../../../src/adapters/git/parser/parser.js'

describe('Parser', () => {
  const parser = new Parser()

  it('should parse simple transaction', () => {
    const input = `2024/01/15 Test transaction
  Assets:Cash    $ -100
  Expenses:Food    $ 100
`
    const ast = parser.parse(input)

    expect(ast.entries).toHaveLength(1)
    expect(ast.entries[0].type).toBe('transaction')

    const txn = ast.entries[0] as { type: 'transaction'; date: string; description: string; postings: unknown[] }
    expect(txn.date).toBe('2024/01/15')
    expect(txn.description).toBe('Test transaction')
    expect(txn.postings).toHaveLength(2)
  })

  it('should parse transaction with dash date format', () => {
    const input = `2024-01-15 Test transaction
  Assets:Cash    $ -100
  Expenses:Food    $ 100
`
    const ast = parser.parse(input)
    const txn = ast.entries[0] as { type: 'transaction'; date: string }
    expect(txn.date).toBe('2024-01-15')
  })

  it('should parse negative amount with prefix minus', () => {
    const input = `2024/01/15 Test
  Assets:Cash    -$ 100
  Expenses:Food    $ 100
`
    const ast = parser.parse(input)
    const txn = ast.entries[0] as { type: 'transaction'; postings: Array<{ amount?: { isNegative: boolean; quantity: string } }> }
    expect(txn.postings[0].amount?.isNegative).toBe(true)
    expect(txn.postings[0].amount?.quantity).toBe('100')
  })

  it('should parse commodity as suffix', () => {
    const input = `2024/01/15 Buy ETH
  Assets:Exchange    ETH 0.5
  Income:Trading    ETH -0.5
`
    const ast = parser.parse(input)
    const txn = ast.entries[0] as { type: 'transaction'; postings: Array<{ amount?: { commodity: string; quantity: string } }> }
    expect(txn.postings[0].amount?.commodity).toBe('ETH')
    expect(txn.postings[0].amount?.quantity).toBe('0.5')
  })

  it('should parse quoted commodity', () => {
    const input = `2024/01/15 Buy bond
  Assets:IOL:AY24    "AY24" 897
  Income:Trading    "AY24" -897
`
    const ast = parser.parse(input)
    const txn = ast.entries[0] as { type: 'transaction'; postings: Array<{ amount?: { commodity: string } }> }
    expect(txn.postings[0].amount?.commodity).toBe('AY24')
  })

  it('should parse price directive', () => {
    const input = `P 2024/01/15 ETH $ 2500.50
`
    const ast = parser.parse(input)

    expect(ast.entries).toHaveLength(1)
    expect(ast.entries[0].type).toBe('price')

    const price = ast.entries[0] as { type: 'price'; date: string; baseCommodity: string; quoteCommodity: string; price: string }
    expect(price.date).toBe('2024/01/15')
    expect(price.baseCommodity).toBe('ETH')
    expect(price.quoteCommodity).toBe('$')
    expect(price.price).toBe('2500.50')
  })

  it('should parse price with comment', () => {
    const input = `P 2024/01/15 ARS $ 0.0104 ;; USD/ARS rate
`
    const ast = parser.parse(input)
    const price = ast.entries[0] as { type: 'price'; comment?: string }
    expect(price.comment).toBe('USD/ARS rate')
  })

  it('should parse standalone comment', () => {
    const input = `; This is a comment
`
    const ast = parser.parse(input)
    expect(ast.entries).toHaveLength(1)
    expect(ast.entries[0].type).toBe('comment')
  })

  it('should parse mixed journal', () => {
    const input = `; Opening prices
P 2024/01/01 ETH $ 2000

2024/01/15 Buy groceries
  Assets:Cash    $ -50
  Expenses:Food    $ 50

P 2024/01/15 ETH $ 2100

2024/01/16 Coffee
  Assets:Cash    $ -5
  Expenses:Food    $ 5
`
    const ast = parser.parse(input)

    // Filter by type
    const txns = ast.entries.filter(e => e.type === 'transaction')
    const prices = ast.entries.filter(e => e.type === 'price')
    const comments = ast.entries.filter(e => e.type === 'comment')

    expect(txns).toHaveLength(2)
    expect(prices).toHaveLength(2)
    expect(comments).toHaveLength(1)
  })

  it('should handle real journal format', () => {
    const input = `2020/07/09 Opening assets
  Income:Salary
  Assets:1_Security:Santander:Checking             $ 78.10
  Assets:1_Security:IOL:AY24        "AY24" 897

P 2020/07/09 ARS $ 0.0104 ;; USDARS turista
`
    const ast = parser.parse(input)

    expect(ast.entries.length).toBeGreaterThanOrEqual(2)

    const txn = ast.entries.find(e => e.type === 'transaction') as { type: 'transaction'; postings: unknown[] }
    expect(txn).toBeDefined()
    expect(txn.postings.length).toBeGreaterThanOrEqual(2)
  })
})
