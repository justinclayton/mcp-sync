import { existsSync } from 'fs';
import { join } from 'path';
import { homedir, platform } from 'os';
import type { HarnessAdapter } from './types.ts';
import type { McpServer } from '../schema.ts';
import { getTransport } from '../schema.ts';

/**
 * Claude Desktop adapter.
 * Global only. Uses: ~/Library/Application Support/Claude/claude_desktop_config.json (macOS)
 * or %APPDATA%/Claude/claude_desktop_config.json (Windows).
 * Format: { "mcpServers": { "name": { "command": "...", "args": [...], "env": {...} } } }
 */

function getConfigPath(): string {
  if (platform() === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
  } else if (platform() === 'win32') {
    return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
  }
  return join(homedir(), '.config', 'claude', 'claude_desktop_config.json');
}

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
      url: s.url,
    };
    if (s.headers && Object.keys(s.headers).length) entry.headers = s.headers;
    return entry;
  }
}

export const claudeDesktop: HarnessAdapter = {
  name: 'claude-desktop',
  displayName: 'Claude Desktop',

  detect(_scope, _projectDir) {
    return existsSync(getConfigPath());
  },

  configPath(_scope, _projectDir) {
    // Claude Desktop only has a global config
    return getConfigPath();
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
