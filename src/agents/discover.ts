import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join, basename, extname } from 'path';
import jsYaml from 'js-yaml';
import type { AgentFile } from './types.ts';

/**
 * Parse YAML frontmatter and body from a markdown string.
 * Returns null if the file has no frontmatter.
 */
function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } | null {
  if (!content.startsWith('---')) {
    return null;
  }

  const endIdx = content.indexOf('\n---', 3);
  if (endIdx === -1) {
    return null;
  }

  const yamlStr = content.slice(3, endIdx).trim();
  const body = content.slice(endIdx + 4); // skip '\n---'

  let frontmatter: Record<string, unknown>;
  try {
    frontmatter = (jsYaml.load(yamlStr) as Record<string, unknown>) ?? {};
  } catch {
    frontmatter = {};
  }

  return { frontmatter, body };
}

/**
 * Build an AgentFile from raw file content and filename.
 */
function buildAgentFile(filename: string, content: string): AgentFile {
  const parsed = parseFrontmatter(content);
  const frontmatter = parsed?.frontmatter ?? {};
  const body = parsed?.body ?? content;
  const nameFromFrontmatter = typeof frontmatter['name'] === 'string' ? frontmatter['name'] : undefined;
  const name = nameFromFrontmatter ?? basename(filename, extname(filename));
  return { name, frontmatter, body, filename };
}

/**
 * Discover agent .md files from a local directory.
 */
export function discoverAgentsFromDir(dirPath: string): AgentFile[] {
  if (!existsSync(dirPath)) {
    throw new Error(`Agents directory not found: ${dirPath}`);
  }

  const entries = readdirSync(dirPath);
  const agents: AgentFile[] = [];

  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue;
    const filePath = join(dirPath, entry);
    if (!statSync(filePath).isFile()) continue;
    const content = readFileSync(filePath, 'utf8');
    agents.push(buildAgentFile(entry, content));
  }

  return agents;
}

/**
 * Discover a single agent from a local .md file path.
 */
export function discoverAgentFromFile(filePath: string): AgentFile {
  if (!existsSync(filePath)) {
    throw new Error(`Agent file not found: ${filePath}`);
  }
  const content = readFileSync(filePath, 'utf8');
  return buildAgentFile(basename(filePath), content);
}

/**
 * Convert a GitHub blob URL to a raw download URL.
 * e.g. https://github.com/owner/repo/blob/main/agents/foo.md
 *   → https://raw.githubusercontent.com/owner/repo/main/agents/foo.md
 */
function githubBlobToRaw(url: string): string {
  return url
    .replace('github.com', 'raw.githubusercontent.com')
    .replace('/blob/', '/');
}

/**
 * Parse a GitHub tree URL into its API endpoint.
 * e.g. https://github.com/owner/repo/tree/main/agents
 *   → https://api.github.com/repos/owner/repo/contents/agents?ref=main
 */
function parseGithubTreeUrl(url: string): string | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.*)/);
  if (!match) return null;
  const [, owner, repo, ref, path] = match;
  return `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${ref}`;
}

/**
 * Discover agents from a URL.
 * Supports:
 *  - GitHub blob URL (single .md file)
 *  - GitHub tree URL (directory listing via GitHub API)
 *  - Any direct .md URL
 */
export async function discoverAgentsFromUrl(url: string): Promise<AgentFile[]> {
  // GitHub tree URL → directory listing
  const apiUrl = parseGithubTreeUrl(url);
  if (apiUrl) {
    let response: Response;
    try {
      response = await fetch(apiUrl, {
        headers: { 'Accept': 'application/vnd.github.v3+json' },
      });
    } catch (err) {
      throw new Error(`Cannot fetch agent directory from URL: ${(err as Error).message}`);
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} fetching agent directory from: ${apiUrl}`);
    }

    const entries = await response.json() as Array<{ name: string; download_url: string; type: string }>;
    const mdFiles = entries.filter(e => e.type === 'file' && e.name.endsWith('.md'));

    const agents: AgentFile[] = [];
    for (const file of mdFiles) {
      const content = await fetchText(file.download_url);
      agents.push(buildAgentFile(file.name, content));
    }
    return agents;
  }

  // GitHub blob URL → single file (raw)
  const rawUrl = url.includes('github.com') && url.includes('/blob/')
    ? githubBlobToRaw(url)
    : url;

  const content = await fetchText(rawUrl);
  const filename = basename(new URL(rawUrl).pathname);
  return [buildAgentFile(filename.endsWith('.md') ? filename : `${filename}.md`, content)];
}

async function fetchText(url: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new Error(`Cannot fetch from URL: ${(err as Error).message}`);
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching: ${url}`);
  }
  return response.text();
}

/**
 * Discover agents from a source — auto-detects local file, local dir, or URL.
 */
export async function discoverAgents(source: string): Promise<AgentFile[]> {
  if (source.startsWith('http://') || source.startsWith('https://')) {
    return discoverAgentsFromUrl(source);
  }

  if (existsSync(source) && statSync(source).isDirectory()) {
    return discoverAgentsFromDir(source);
  }

  if (existsSync(source) && source.endsWith('.md')) {
    return [discoverAgentFromFile(source)];
  }

  throw new Error(`Agents source not found: ${source}`);
}
