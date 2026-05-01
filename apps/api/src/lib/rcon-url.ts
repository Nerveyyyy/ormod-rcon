/**
 * Build the WebSocket URL the RCON adapter dials. The bracket logic
 * preserves IPv6 literals (`::1`, `2001:db8::1`) which would otherwise
 * be parsed as host:port by URL constructors.
 */
export const buildRconUrl = (host: string, port: number): string => {
  const needsBrackets = host.includes(':') && !host.startsWith('[')
  const authority = needsBrackets ? `[${ host }]` : host
  return `ws://${ authority }:${ port }`
}
