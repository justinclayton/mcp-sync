import { existsSync } from 'fs';
import { join } from 'path';
import { homedir, platform } from 'os';
import type { HarnessAdapter } from './types.ts';
import type { McpServer } from '../schema.ts';
import { getTransport } from '../schema.ts';

/**
 * Zed adapter.
 * MCP servers are configured under "context_servers" in settings.json.
 * Format: { "context_servers": { "name": { "command": { "path": "...", "args": [...], "env": {...} } } } }
 * Global: ~/.config/zed/settings.json (Linux) or ~/Library/Application Support/Zed/settings.json (macOS)
 * Project: .zed/settings.json
 */

function getGlobalConfigDir(): string {
  if (platform() === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'Zed');
  }
  return join(homedir(), '.config', 'zed');
}

function translateServer(server: McpServer): Record<string, unknown> {
  const transport = getTransport(server);
  if (transport === 'stdio') {
    const s = server as { command: string; args?: string[]; env?: Record<string, string> };
    const command: Record<string, unknown> = {
      path: s.command,
    };
    if (s.args?.length) command.args = s.args;
    if (s.env && Object.keys(s.env).length) command.env = s.env;
    return { command };
  } else {
    const s = server as { url: string; headers?: Record<string, string> };
    const entry: Record<string, unknown> = {
      url: s.url,
    };
    if (s.headers && Object.keys(s.headers).length) entry.headers = s.headers;
    return entry;
  }
}

export const zed: HarnessAdapter = {
  name: 'zed',
  displayName: 'Zed',

  detect(scope, projectDir) {
    if (scope === 'global') {
      return existsSync(join(getGlobalConfigDir(), 'settings.json'));
    }
    return existsSync(join(projectDir, '.zed'));
  },

  configPath(scope, projectDir) {
    if (scope === 'global') {
      return join(getGlobalConfigDir(), 'settings.json');
    }
    return join(projectDir, '.zed', 'settings.json');
  },

  translate(servers) {
    const contextServers: Record<string, unknown> = {};
    for (const [name, server] of Object.entries(servers)) {
      contextServers[name] = translateServer(server);
    }
    return { context_servers: contextServers };
  },

  extractServers(nativeConfig) {
    return nativeConfig.context_servers as Record<string, unknown> | undefined;
  },

  merge(existing, translated) {
    const merged = { ...existing };
    const existingServers = (merged.context_servers ?? {}) as Record<string, unknown>;
    const newServers = (translated as { context_servers: Record<string, unknown> }).context_servers;
    merged.context_servers = { ...existingServers, ...newServers };
    return merged;
  },

  remove(existing, serverNames) {
    const merged = { ...existing };
    const servers = { ...(merged.context_servers as Record<string, unknown> ?? {}) };
    for (const name of serverNames) {
      delete servers[name];
    }
    merged.context_servers = servers;
    return merged;
  },
};
