import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { HarnessAdapter } from './types.ts';
import type { McpServer } from '../schema.ts';

/**
 * Cursor adapter.
 * Cursor uses the same format as Claude Code for MCP servers:
 * stdio: { "command": "...", "args": [...], "env": {...} }
 * http:  { "url": "..." }
 * Config lives in .cursor/mcp.json (project) or ~/.cursor/mcp.json (global).
 */
export const cursor: HarnessAdapter = {
  name: 'cursor',
  displayName: 'Cursor',

  detect(scope, projectDir) {
    if (scope === 'global') {
      return existsSync(join(homedir(), '.cursor'));
    }
    return existsSync(join(projectDir, '.cursor'));
  },

  configPath(scope, projectDir) {
    if (scope === 'global') {
      return join(homedir(), '.cursor', 'mcp.json');
    }
    return join(projectDir, '.cursor', 'mcp.json');
  },

  translate(servers) {
    const mcpServers: Record<string, unknown> = {};
    for (const [name, server] of Object.entries(servers)) {
      mcpServers[name] = { ...server };
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
