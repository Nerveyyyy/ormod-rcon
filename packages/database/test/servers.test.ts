import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { servers } from '../src/schema/index.js'

describe('servers table', () => {
  it('has the expected columns', () => {
    const names = getTableConfig(servers).columns.map((c) => c.name)
    expect(names).toEqual(
      expect.arrayContaining([
        'id',
        'organization_id',
        'name',
        'host',
        'port',
        'enabled',
        'created_at',
        'updated_at',
      ])
    )
  })

  it('references organization with a foreign key', () => {
    const fks = getTableConfig(servers).foreignKeys
    expect(fks.length).toBe(1)
  })

  it('enforces tenant-scoped unique server names', () => {
    const uniques = getTableConfig(servers).uniqueConstraints
    expect(uniques.length).toBe(1)
    const first = uniques[0]
    expect(first?.columns.map((c) => c.name)).toEqual([
      'organization_id',
      'name',
    ])
  })
})
