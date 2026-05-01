import type { RconClient, RconClientState } from '../../src/index.js'

/**
 * Shared polling helpers for integration tests. Prefer these over
 * hardcoded `setTimeout` sleeps — sleeps are brittle on slow CI and hide
 * the intent of what the test is actually waiting on.
 */

export const waitForState = (
  client: RconClient,
  kinds: Array<string>,
  timeoutMs = 2_000,
): Promise<void> => {
  if (kinds.includes(client.state.kind)) {
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      client.off('state', onState)
      reject(
        new Error(
          `timed out waiting for state ∈ ${ kinds.join(',') }. current=${ client.state.kind }`,
        ),
      )
    }, timeoutMs)
    const onState = (s: RconClientState): void => {
      if (kinds.includes(s.kind)) {
        clearTimeout(timer)
        client.off('state', onState)
        resolve()
      }
    }
    client.on('state', onState)
  })
}

export const waitForCondition = (
  fn: () => boolean,
  label: string,
  timeoutMs = 2_000,
  intervalMs = 10,
): Promise<void> => {
  if (fn()) {
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const check = (): void => {
      if (fn()) {
        resolve()
        return
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error(`timed out waiting for: ${ label }`))
        return
      }
      setTimeout(check, intervalMs)
    }
    setTimeout(check, intervalMs)
  })
}
