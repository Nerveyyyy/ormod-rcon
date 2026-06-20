import { describe, it, expect } from 'vitest'

import { hello } from '../src/index.js'

describe('ormod-rcon', () => {
  it('says hello', () => {
    expect(hello()).toBe('hello from ormod-rcon')
  })
})
