import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTokenStore, type TokenStorage } from '../src/renderer/src/auth/tokenStore'

function memoryStorage(): TokenStorage {
  const map = new Map<string, string>()
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value)
    },
    removeItem: (key) => {
      map.delete(key)
    }
  }
}

function throwingStorage(): TokenStorage {
  return {
    getItem() {
      throw new Error('storage disabled')
    },
    setItem() {
      throw new Error('storage disabled')
    },
    removeItem() {
      throw new Error('storage disabled')
    }
  }
}

test('token roundtrip and empty token treated as logged out', () => {
  const store = createTokenStore(memoryStorage())

  assert.equal(store.getToken(), null)
  store.setToken('abc')
  assert.equal(store.getToken(), 'abc')
  store.setToken('')
  assert.equal(store.getToken(), null)
})

test('user roundtrip with shape validation', () => {
  const store = createTokenStore(memoryStorage())
  const user = { id: '1', username: 'alice', role: 'user' }

  store.setUser(user)
  assert.deepEqual(store.getUser(), user)
})

test('corrupted or invalid user json returns null', () => {
  const storage = memoryStorage()
  const store = createTokenStore(storage)

  storage.setItem('shenyouchu.user', 'not-json')
  assert.equal(store.getUser(), null)

  storage.setItem('shenyouchu.user', '{"id":1}')
  assert.equal(store.getUser(), null)
})

test('clear removes token and user', () => {
  const store = createTokenStore(memoryStorage())

  store.setToken('abc')
  store.setUser({ id: '1', username: 'alice', role: 'user' })
  store.clear()

  assert.equal(store.getToken(), null)
  assert.equal(store.getUser(), null)
})

test('disabled storage degrades to logged out instead of throwing', () => {
  const store = createTokenStore(throwingStorage())

  assert.equal(store.getToken(), null)
  assert.equal(store.getUser(), null)
  store.setToken('abc')
  store.setUser({ id: '1', username: 'alice', role: 'user' })
  store.clear()
})