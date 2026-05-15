import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { HarnessAdapter } from './types.ts';
import type { McpServer } from '../schema.ts';
import { getTransport } from '../schema.ts';

/**
 * Windsurf (Codeium) adapter.
 * Uses the same mcpServers format as Claude/Cursor for stdio.
 * For HTTP, uses "serverUrl" instead of "url".
 * Config: ~/.codeium/windsurf/mcp_config.json (global) or .windsurf/mcp.json (project).
 */

function translateServer(server: McpServer): Record<string, unknown> {
  const transport = getTransport(server);
  if (transport === 'stdio') {
    const s = server as { command: string; args?: string[]; env?: Record<string, string> };
    const entry: Record<string, unknown> = {
      command: s.command,
    };
    if (s.args?.length) entry.args = s.args;
    if (s.env && Object.keys(s.env).length) entry.env = s.env;
    return entry;
  } else {
    const s = server as { url: string; headers?: Record<string, string> };
    const entry: Record<string, unknown> = {
      serverUrl: s.url,
    };
    if (s.headers && Object.keys(s.headers).length) entry.headers = s.headers;
    return entry;
  }
}

export const windsurf: HarnessAdapter = {
  name: 'windsurf',
  displayName: 'Windsurf',

  detect(scope, projectDir) {
    if (scope === 'global') {
      return existsSync(join(homedir(), '.codeium', 'windsurf'));
    }
    return existsSync(join(projectDir, '.windsurf'));
  },

  configPath(scope, projectDir) {
    if (scope === 'global') {
      return join(homedir(), '.codeium', 'windsurf', 'mcp_config.json');
    }
    return join(projectDir, '.windsurf', 'mcp.json');
  },

  translate(servers) {
    const mcpServers: Record<string, unknown> = {};
    for (const [name, server] of Object.entries(servers)) {
      mcpServers[name] = translateServer(server);
    }
    return { mcpServers };
  },

  extractServers(nativeConfig) {
    return nativeConfig.mcpServers as Record<string, unknown> | undefined;
  },

  merge(existing, translated) {
    const merged = { ...existing };
    const existingServers = (merged.mcpServers ?? {}) as Record<string, unknown>;
    const newServers = (translated as { mcpServers: Record<string, unknown> }).mcpServers;
    merged.mcpServers = { ...existingServers, ...newServers };
    return merged;
  },

  remove(existing, serverNames) {
    const merged = { ...existing };
    const servers = { ...(merged.mcpServers as Record<string, unknown> ?? {}) };
    for (const name of serverNames) {
      delete servers[name];
    }
    merged.mcpServers = servers;
    return merged;
  },
};
