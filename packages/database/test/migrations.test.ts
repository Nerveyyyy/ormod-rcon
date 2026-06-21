import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const journalPath = fileURLToPath(
  new URL('../migrations/meta/_journal.json', import.meta.url)
)

describe('migrations', () => {
  it('records at least one generated migration', () => {
    const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
    expect(journal.entries.length).toBeGreaterThanOrEqual(1)
  })
})
