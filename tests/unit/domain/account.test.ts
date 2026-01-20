import { describe, it, expect } from 'vitest'
import { Account } from '../../../src/core/domain/account.js'

describe('Account', () => {
  it('should create account from name', () => {
    const account = new Account({ name: 'Assets:Bank:Checking' })
    expect(account.name).toBe('Assets:Bank:Checking')
    expect(account.segments).toEqual(['Assets', 'Bank', 'Checking'])
  })

  it('should infer kind from prefix', () => {
    expect(new Account({ name: 'Assets:Cash' }).kind).toBe('asset')
    expect(new Account({ name: 'Liabilities:CreditCard' }).kind).toBe('liability')
    expect(new Account({ name: 'Income:Salary' }).kind).toBe('income')
    expect(new Account({ name: 'Expenses:Food' }).kind).toBe('expense')
    expect(new Account({ name: 'Equity:Opening' }).kind).toBe('equity')
  })

  it('should allow explicit kind override', () => {
    const account = new Account({ name: 'Custom:Account', kind: 'liability' })
    expect(account.kind).toBe('liability')
  })

  it('should calculate depth', () => {
    expect(new Account({ name: 'Assets' }).depth).toBe(1)
    expect(new Account({ name: 'Assets:Bank' }).depth).toBe(2)
    expect(new Account({ name: 'Assets:Bank:Checking' }).depth).toBe(3)
  })

  it('should return parent account', () => {
    const account = new Account({ name: 'Assets:Bank:Checking' })
    const parent = account.parent

    expect(parent).not.toBeNull()
    expect(parent!.name).toBe('Assets:Bank')
    expect(parent!.parent!.name).toBe('Assets')
    expect(parent!.parent!.parent).toBeNull()
  })

  it('should return root and leaf', () => {
    const account = new Account({ name: 'Assets:Bank:Checking' })
    expect(account.root).toBe('Assets')
    expect(account.leaf).toBe('Checking')
  })

  it('should detect ancestor/descendant relationships', () => {
    const ancestor = new Account({ name: 'Assets:Bank' })
    const descendant = new Account({ name: 'Assets:Bank:Checking' })
    const unrelated = new Account({ name: 'Income:Salary' })

    expect(descendant.isDescendantOf(ancestor)).toBe(true)
    expect(ancestor.isAncestorOf(descendant)).toBe(true)
    expect(ancestor.isDescendantOf(descendant)).toBe(false)
    expect(descendant.isDescendantOf(unrelated)).toBe(false)
  })

  it('should match exact pattern', () => {
    const account = new Account({ name: 'Assets:Bank:Checking' })
    expect(account.matchesPattern('Assets:Bank:Checking')).toBe(true)
    expect(account.matchesPattern('Assets:Bank:Savings')).toBe(false)
  })

  it('should match wildcard pattern (*)', () => {
    const account = new Account({ name: 'Assets:Bank:Checking' })
    expect(account.matchesPattern('Assets:*:Checking')).toBe(true)
    expect(account.matchesPattern('*:Bank:Checking')).toBe(true)
    expect(account.matchesPattern('Assets:*:Savings')).toBe(false)
  })

  it('should match double wildcard pattern (**)', () => {
    const account = new Account({ name: 'Assets:Bank:Checking' })
    expect(account.matchesPattern('Assets:**')).toBe(true)
    expect(account.matchesPattern('**:Checking')).toBe(true)
    expect(account.matchesPattern('Assets:**:Checking')).toBe(true)
    expect(account.matchesPattern('Income:**')).toBe(false)
  })

  it('should throw on empty name', () => {
    expect(() => new Account({ name: '' })).toThrow('Account name cannot be empty')
    expect(() => new Account({ name: '  ' })).toThrow('Account name cannot be empty')
  })
})
