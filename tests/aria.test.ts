import { expect, it } from 'vitest'
import { ariaFileFor, ariaLineDiff } from '../src/lib/aria.ts'

it('names the snapshot beside its screenshot', () => {
  expect(ariaFileFor('home__ideal__390__light.png')).toBe('home__ideal__390__light.aria.yml')
})

it('lists removed and added lines in order and nothing for equal snapshots', () => {
  const before = '- heading "Checkout" [level=1]\n- button "Pay now"\n- link "Help"\n'
  const after = '- heading "Checkout" [level=2]\n- button\n- link "Help"\n'
  expect(ariaLineDiff(before, before)).toEqual([])
  expect(ariaLineDiff(before, `${before}\n`)).toEqual([])
  expect(ariaLineDiff(before, after)).toEqual([
    '- - heading "Checkout" [level=1]',
    '- - button "Pay now"',
    '+ - heading "Checkout" [level=2]',
    '+ - button',
  ])
})

it('summarizes instead of building a huge table for very long snapshots', () => {
  const long = Array.from({ length: 10 }, (_, i) => `- text ${i}`).join('\n')
  expect(ariaLineDiff(long, `${long}\n- extra`, 5)).toEqual([
    '~ snapshots differ (10 and 11 lines; too long to list)',
  ])
})
