export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/
export const SERVER_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/

export function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export async function uniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>
): Promise<string> {
  const slug = generateSlug(base)
  if (!(await exists(slug))) return slug
  for (let i = 2; i < 100; i++) {
    const candidate = `${slug}-${i}`
    if (!(await exists(candidate))) return candidate
  }
  throw new Error('Could not generate unique slug')
}
