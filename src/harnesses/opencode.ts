import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { HarnessAdapter } from './types.ts';
import type { McpServer } from '../schema.ts';
import { getTransport } from '../schema.ts';
import { transformForOpenCode } from '../agents/transform.ts';

function translateServer(server: McpServer): Record<string, unknown> {
  const transport = getTransport(server);
  if (transport === 'stdio') {
    const s = server as { command: string; args?: string[]; env?: Record<string, string> };
    const cmd = [s.command, ...(s.args ?? [])];
    const entry: Record<string, unknown> = {
      type: 'local',
      command: cmd,
    };
    if (s.env && Object.keys(s.env).length) entry.env = s.env;
    return entry;
  } else {
    const s = server as { url: string; headers?: Record<string, string> };
    const entry: Record<string, unknown> = {
      type: 'remote',
      url: s.url,
    };
    if (s.headers && Object.keys(s.headers).length) entry.headers = s.headers;
    return entry;
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

  agentsDir(scope, projectDir) {
    if (scope === 'global') {
      return join(homedir(), '.config', 'opencode', 'agents');
    }
    return join(projectDir, '.opencode', 'agents');
  },

  transformAgent(frontmatter, body) {
    return { frontmatter: transformForOpenCode(frontmatter), body };
  },
};
