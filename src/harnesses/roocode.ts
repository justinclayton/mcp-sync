import { existsSync } from 'fs';
import { join } from 'path';
import { homedir, platform } from 'os';
import type { HarnessAdapter } from './types.ts';
import type { McpServer } from '../schema.ts';
import { getTransport } from '../schema.ts';

/**
 * Roo Code (VS Code extension) adapter.
 * Uses same format as Claude: { "mcpServers": { "name": { "command": "...", "args": [...], "env": {...} } } }
 * Project: .roo/mcp.json
 * Global: VS Code globalStorage path for the extension.
 */

function getGlobalConfigPath(): string {
  if (platform() === 'darwin') {
    return join(homedir(), 'Library', 'Application Support', 'Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings', 'mcp_settings.json');
  } else if (platform() === 'win32') {
    return join(process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming'), 'Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings', 'mcp_settings.json');
  }
  return join(homedir(), '.config', 'Code', 'User', 'globalStorage', 'rooveterinaryinc.roo-cline', 'settings', 'mcp_settings.json');
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
      type: 'sse',
    };
    if (s.headers && Object.keys(s.headers).length) entry.headers = s.headers;
    return entry;
  }
}

export const roocode: HarnessAdapter = {
  name: 'roocode',
  displayName: 'Roo Code',

  detect(scope, projectDir) {
    if (scope === 'global') {
      return existsSync(getGlobalConfigPath());
    }
    return existsSync(join(projectDir, '.roo'));
  },

  configPath(scope, projectDir) {
    if (scope === 'global') {
      return getGlobalConfigPath();
    }
    return join(projectDir, '.roo', 'mcp.json');
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
