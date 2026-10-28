import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  avatarSourceLabel,
  resolveAvatarSource
} from '../src/renderer/src/portrait/avatarSource'

test('loading wins over any cached portraits', () => {
  assert.equal(resolveAvatarSource({ neutral: 'n' }, true), 'loading')
  assert.equal(resolveAvatarSource(null, true), 'loading')
})

test('any imported portrait selects the user portrait source', () => {
  assert.equal(resolveAvatarSource({ neutral: 'n' }, false), 'portrait')
  assert.equal(resolveAvatarSource({ happy: 'h' }, false), 'portrait')
})

test('missing portraits fall back to the vector source', () => {
  assert.equal(resolveAvatarSource(null, false), 'vector')
  assert.equal(resolveAvatarSource({}, false), 'vector')
})

test('labels describe the active source', () => {
  assert.equal(avatarSourceLabel('loading'), '正在加载形象')
  assert.equal(avatarSourceLabel('portrait'), '用户立绘')
  assert.equal(avatarSourceLabel('vector'), '默认矢量形象')
})
