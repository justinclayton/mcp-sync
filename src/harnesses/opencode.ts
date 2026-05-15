import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { HarnessAdapter } from './types.ts';
import type { McpServer } from '../schema.ts';

function translateServer(server: McpServer): Record<string, unknown> {
  switch (server.transport) {
    case 'stdio': {
      const cmd = [server.command, ...(server.args ?? [])];
      const entry: Record<string, unknown> = {
        type: 'local',
        command: cmd,
      };
      if (server.env && Object.keys(server.env).length) entry.env = server.env;
      return entry;
    }
    case 'http': {
      const entry: Record<string, unknown> = {
        type: 'remote',
        url: server.url,
      };
      if (server.headers && Object.keys(server.headers).length) entry.headers = server.headers;
      return entry;
    }
    case 'sse': {
      const entry: Record<string, unknown> = {
        type: 'remote',
        url: server.url,
      };
      if (server.headers && Object.keys(server.headers).length) entry.headers = server.headers;
      return entry;
    }
  }
}

export const opencode: HarnessAdapter = {
  name: 'opencode',
  displayName: 'OpenCode',

  detect(scope, projectDir) {
    if (scope === 'global') {
      return existsSync(join(homedir(), '.config', 'opencode', 'opencode.json'));
    }
    return existsSync(join(projectDir, 'opencode.json')) || existsSync(join(projectDir, '.opencode'));
  },

  configPath(scope, projectDir) {
    if (scope === 'global') {
      return join(homedir(), '.config', 'opencode', 'opencode.json');
    }
    return join(projectDir, 'opencode.json');
  },

  translate(servers) {
    const mcp: Record<string, unknown> = {};
    for (const [name, server] of Object.entries(servers)) {
      mcp[name] = translateServer(server);
    }
    return { mcp };
  },

  extractServers(nativeConfig) {
    return nativeConfig.mcp as Record<string, unknown> | undefined;
  },

  merge(existing, translated) {
    const merged = { ...existing };
    const existingMcp = (merged.mcp ?? {}) as Record<string, unknown>;
    const newMcp = (translated as { mcp: Record<string, unknown> }).mcp;
    merged.mcp = { ...existingMcp, ...newMcp };
    return merged;
  },

  remove(existing, serverNames) {
    const merged = { ...existing };
    const servers = { ...(merged.mcp as Record<string, unknown> ?? {}) };
    for (const name of serverNames) {
      delete servers[name];
    }
    merged.mcp = servers;
    return merged;
  },
};
