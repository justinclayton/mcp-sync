import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type { HarnessAdapter } from './types.ts';
import type { McpServer } from '../schema.ts';
import { getTransport } from '../schema.ts';
import { transformForClaude } from '../agents/transform.ts';

/**
 * Claude Code adapter.
 * Claude's native format is our canonical format — pass through as-is.
 */
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
    // Our canonical format IS Claude's format — just pass through
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

  agentsDir(scope, projectDir) {
    if (scope === 'global') {
      return join(homedir(), '.claude', 'agents');
    }
    return join(projectDir, '.claude', 'agents');
  },

  transformAgent(frontmatter, body) {
    return { frontmatter: transformForClaude(frontmatter), body };
  },
};
