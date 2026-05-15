import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { HarnessAdapter } from './types.ts';
import type { McpServer } from '../schema.ts';

function translateServer(server: McpServer): Record<string, unknown> {
  switch (server.transport) {
    case 'stdio': {
      const entry: Record<string, unknown> = {
        command: server.command,
      };
      if (server.args?.length) entry.args = server.args;
      if (server.env && Object.keys(server.env).length) entry.env = server.env;
      return entry;
    }
    case 'http':
    case 'sse': {
      const entry: Record<string, unknown> = {
        url: server.url,
      };
      if (server.headers && Object.keys(server.headers).length) entry.headers = server.headers;
      return entry;
    }
  }
}

export const claude: HarnessAdapter = {
  name: 'claude',
  displayName: 'Claude Code',

  detect(scope, projectDir) {
    if (scope === 'global') {
      return existsSync(join(homedir(), '.claude.json'));
    }
    return existsSync(join(projectDir, '.mcp.json')) || existsSync(join(projectDir, '.claude'));
  },

  configPath(scope, projectDir) {
    if (scope === 'global') {
      return join(homedir(), '.claude.json');
    }
    return join(projectDir, '.mcp.json');
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
