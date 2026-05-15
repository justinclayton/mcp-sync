import { readFileSync, existsSync } from 'fs';
import { McpConfigSchema, type McpConfig } from './schema.ts';

/**
 * Load and validate an mcp.json config from a local file path.
 */
export function loadConfigFromFile(filePath: string): McpConfig {
  if (!existsSync(filePath)) {
    throw new Error(`Config file not found: ${filePath}`);
  }

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new Error(`Cannot read config file: ${(err as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Config file is not valid JSON: ${filePath}`);
  }

  const result = McpConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map(i => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid mcp.json config:\n${issues}`);
  }

  return result.data;
}

/**
 * Load mcp.json from a URL (GitHub raw, gist, any HTTPS endpoint).
 * Handles GitHub blob URLs by converting to raw URLs.
 */
export async function loadConfigFromUrl(url: string): Promise<McpConfig> {
  // Convert GitHub blob URLs to raw URLs
  const rawUrl = url
    .replace('github.com', 'raw.githubusercontent.com')
    .replace('/blob/', '/');

  let response: Response;
  try {
    response = await fetch(rawUrl);
  } catch (err) {
    throw new Error(`Cannot fetch config from URL: ${(err as Error).message}`);
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching config from: ${rawUrl}`);
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    throw new Error(`Response is not valid JSON from: ${rawUrl}`);
  }

  const result = McpConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map(i => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid mcp.json config from URL:\n${issues}`);
  }

  return result.data;
}

/**
 * Load config from either a file path or URL.
 */
export async function loadConfig(source: string): Promise<McpConfig> {
  if (source.startsWith('http://') || source.startsWith('https://')) {
    return loadConfigFromUrl(source);
  }
  return loadConfigFromFile(source);
}
