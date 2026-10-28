import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PORTRAIT_SLOTS,
  hasPortrait,
  moodToExpression,
  resolvePortrait
} from '../src/renderer/src/portrait/expression'

test('resolvePortrait prefers the requested expression', () => {
  const portraits = { neutral: 'n', happy: 'h' }
  assert.equal(resolvePortrait(portraits, 'happy'), 'h')
  assert.equal(resolvePortrait(portraits, 'angry'), 'n')
})

test('resolvePortrait falls back to any imported expression when neutral is missing', () => {
  const portraits = { sad: 's' }
  assert.equal(resolvePortrait(portraits, 'happy'), 's')
})

test('resolvePortrait returns null for missing or empty sets', () => {
  assert.equal(resolvePortrait(null, 'neutral'), null)
  assert.equal(resolvePortrait({}, 'neutral'), null)
  assert.equal(resolvePortrait({ neutral: '' }, 'neutral'), null)
})

test('hasPortrait detects whether any expression exists', () => {
  assert.equal(hasPortrait(null), false)
  assert.equal(hasPortrait({}), false)
  assert.equal(hasPortrait({ happy: 'h' }), true)
  assert.equal(hasPortrait({ neutral: 'n', closed: 'c' }), true)
})

test('moodToExpression maps high and low moods', () => {
  assert.equal(moodToExpression(90), 'happy')
  assert.equal(moodToExpression(70), 'happy')
  assert.equal(moodToExpression(50), 'neutral')
  assert.equal(moodToExpression(30), 'sad')
  assert.equal(moodToExpression(10), 'sad')
  assert.equal(moodToExpression(null), 'neutral')
})

test('portrait slot ids are unique and include neutral', () => {
  const ids = PORTRAIT_SLOTS.map((slot) => slot.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(ids.includes('neutral'))
  assert.ok(ids.includes('closed'))
})
