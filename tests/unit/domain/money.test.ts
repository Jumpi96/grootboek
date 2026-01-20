import { describe, it, expect } from 'vitest'
import { Money } from '../../../src/core/domain/money.js'
import { Decimal } from '../../../src/core/utils/decimal.js'

describe('Money', () => {
  it('should create money with decimal quantity', () => {
    const money = new Money({ quantity: new Decimal('100.50'), commodity: '$' })
    expect(money.quantity.toString()).toBe('100.5')
    expect(money.commodity).toBe('$')
  })

  it('should create money from string quantity', () => {
    const money = new Money({ quantity: '100.50', commodity: 'USD' })
    expect(money.quantity.toString()).toBe('100.5')
  })

  it('should create money from number quantity', () => {
    const money = new Money({ quantity: 100, commodity: 'EUR' })
    expect(money.quantity.toNumber()).toBe(100)
  })

  it('should detect zero', () => {
    expect(Money.zero('$').isZero()).toBe(true)
    expect(new Money({ quantity: 0, commodity: '$' }).isZero()).toBe(true)
    expect(new Money({ quantity: 100, commodity: '$' }).isZero()).toBe(false)
  })

  it('should detect positive/negative', () => {
    const positive = new Money({ quantity: 100, commodity: '$' })
    const negative = new Money({ quantity: -100, commodity: '$' })
    const zero = Money.zero('$')

    expect(positive.isPositive()).toBe(true)
    expect(positive.isNegative()).toBe(false)
    expect(negative.isPositive()).toBe(false)
    expect(negative.isNegative()).toBe(true)
    expect(zero.isPositive()).toBe(false)
    expect(zero.isNegative()).toBe(false)
  })

  it('should negate correctly', () => {
    const money = new Money({ quantity: 100, commodity: '$' })
    const negated = money.negate()
    expect(negated.quantity.toString()).toBe('-100')
    expect(negated.commodity).toBe('$')
  })

  it('should get absolute value', () => {
    const negative = new Money({ quantity: -100, commodity: '$' })
    const abs = negative.abs()
    expect(abs.quantity.toString()).toBe('100')
  })

  it('should add same commodity', () => {
    const a = new Money({ quantity: 100, commodity: '$' })
    const b = new Money({ quantity: 50, commodity: '$' })
    const sum = a.add(b)
    expect(sum.quantity.toString()).toBe('150')
    expect(sum.commodity).toBe('$')
  })

  it('should throw when adding different commodities', () => {
    const a = new Money({ quantity: 100, commodity: '$' })
    const b = new Money({ quantity: 50, commodity: 'EUR' })
    expect(() => a.add(b)).toThrow('Cannot add different commodities')
  })

  it('should subtract same commodity', () => {
    const a = new Money({ quantity: 100, commodity: '$' })
    const b = new Money({ quantity: 30, commodity: '$' })
    const diff = a.subtract(b)
    expect(diff.quantity.toString()).toBe('70')
  })

  it('should multiply by factor', () => {
    const money = new Money({ quantity: 100, commodity: '$' })
    const multiplied = money.multiply(1.5)
    expect(multiplied.quantity.toString()).toBe('150')
  })

  it('should check equality', () => {
    const a = new Money({ quantity: 100, commodity: '$' })
    const b = new Money({ quantity: 100, commodity: '$' })
    const c = new Money({ quantity: 100, commodity: 'EUR' })
    const d = new Money({ quantity: 50, commodity: '$' })

    expect(a.equals(b)).toBe(true)
    expect(a.equals(c)).toBe(false)
    expect(a.equals(d)).toBe(false)
  })
})
