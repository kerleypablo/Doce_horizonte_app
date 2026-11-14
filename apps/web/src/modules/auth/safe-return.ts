export function safeMcpReviewPath(value: unknown): string | null {
  return typeof value === 'string' && /^\/app\/mcp\/revisar\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
}
