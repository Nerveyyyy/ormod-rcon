import { getTableConfig } from 'drizzle-orm/pg-core'
import { describe, expect, it } from 'vitest'
import { account, organization, twoFactor, user } from '../src/schema/auth.js'

const columnNames = (table: Parameters<typeof getTableConfig>[0]) => {
  return getTableConfig(table).columns.map((c) => c.name)
}

describe('generated auth schema', () => {
  it('keeps better-auth core tables', () => {
    expect(columnNames(user)).toEqual(
      expect.arrayContaining(['id', 'email', 'name'])
    )
    expect(columnNames(account)).toEqual(
      expect.arrayContaining(['id', 'account_id', 'user_id'])
    )
  })

  it('adds the organization status field', () => {
    expect(columnNames(organization)).toContain('status')
  })

  it('adds two-factor fields', () => {
    expect(columnNames(user)).toContain('two_factor_enabled')
    expect(columnNames(twoFactor)).toEqual(
      expect.arrayContaining(['secret', 'backup_codes'])
    )
  })

  it('does not add admin columns', () => {
    expect(columnNames(user)).not.toContain('role')
    expect(columnNames(user)).not.toContain('banned')
  })

  it('adds the mustChangePassword field', () => {
    expect(columnNames(user)).toContain('must_change_password')
  })
})
