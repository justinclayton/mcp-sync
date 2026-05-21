import { describe, it, expect } from 'vitest';
import { resolveKeychainServers } from '../src/resolve-keychain.ts';
import type { McpServer } from '../src/schema.ts';
import { readFileSync } from 'fs';

describe('resolveKeychainServers', () => {
  it('passes through servers without keychain refs', () => {
    const servers: Record<string, McpServer> = {
      plain: { command: 'echo', args: ['hello'], env: { FOO: 'bar' } },
    };

    const result = resolveKeychainServers(servers);
    expect(result.servers.plain).toEqual(servers.plain);
    expect(result.generatedWrappers).toHaveLength(0);
    expect(result.allRefs).toHaveLength(0);
  });

  it('generates wrapper for stdio server with keychain refs', () => {
    const servers: Record<string, McpServer> = {
      github: {
        command: 'npx',
        args: ['server-github'],
        env: { TOKEN: '${keychain:gh-token}' },
      },
    };

    const result = resolveKeychainServers(servers, './mcp.json');
    expect(result.generatedWrappers).toHaveLength(1);
    expect(result.allRefs).toHaveLength(1);
    expect(result.allRefs[0]!.service).toBe('gh-token');

    // The resolved server should point to wrapper
    const resolved = result.servers.github as { command: string; args: string[] };
    expect(resolved.command).toContain('.mcp-sync/wrappers/github.sh');
    expect(resolved.args).toEqual([]);
  });

  it('warns on HTTP servers with keychain refs in headers', () => {
    const servers: Record<string, McpServer> = {
      linear: {
        url: 'https://mcp.linear.app/sse',
        headers: { Authorization: 'Bearer ${keychain:linear-key}' },
      },
    };

    const result = resolveKeychainServers(servers);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('not yet supported');
    // Server passes through unchanged
    expect(result.servers.linear).toEqual(servers.linear);
  });

  it('handles mix of keychain and non-keychain servers', () => {
    const servers: Record<string, McpServer> = {
      plain: { command: 'echo', args: [] },
      secret: { command: 'srv', env: { KEY: '${keychain:k}' } },
      http: { url: 'https://example.com' },
    };

    const result = resolveKeychainServers(servers);
    expect(result.generatedWrappers).toHaveLength(1);
    expect(result.servers.plain).toEqual(servers.plain);
    expect(result.servers.http).toEqual(servers.http);
    const secret = result.servers.secret as { command: string };
    expect(secret.command).toContain('wrappers/secret.sh');
  });
});
