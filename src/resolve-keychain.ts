import type { McpServer, StdioServer } from './schema.ts';
import { getTransport } from './schema.ts';
import { envHasKeychainRefs, collectKeychainRefs, keychainItemExists, type KeychainRef } from './keychain.ts';
import { generateWrapper, removeWrapper } from './wrappers.ts';

export interface ResolveResult {
  /** The servers with keychain refs replaced by wrapper commands */
  servers: Record<string, McpServer>;
  /** Warnings for missing keychain items or unsupported usage */
  warnings: string[];
  /** Wrappers that were generated */
  generatedWrappers: string[];
  /** All keychain refs that were found (for validation) */
  allRefs: KeychainRef[];
}

/**
 * Process servers, generating wrappers for any that have ${keychain:...} references.
 * Returns a new servers record where keychain-using stdio servers are replaced
 * with entries pointing to their generated wrapper scripts.
 */
export function resolveKeychainServers(
  servers: Record<string, McpServer>,
  sourcePath?: string,
): ResolveResult {
  const resolved: Record<string, McpServer> = {};
  const warnings: string[] = [];
  const generatedWrappers: string[] = [];
  const allRefs: KeychainRef[] = [];

  for (const [name, server] of Object.entries(servers)) {
    const transport = getTransport(server);

    if (transport === 'stdio') {
      const stdioServer = server as StdioServer;
      if (envHasKeychainRefs(stdioServer.env)) {
        // Generate wrapper and replace server entry
        const result = generateWrapper(name, stdioServer, sourcePath);
        generatedWrappers.push(result.path);
        allRefs.push(...result.refs);

        // Replace with wrapper-pointing server
        resolved[name] = {
          command: result.path,
          args: [],
        };
      } else {
        resolved[name] = server;
      }
    } else {
      // HTTP servers — pass through (keychain in headers not supported yet)
      const httpServer = server as { url: string; headers?: Record<string, string> };
      if (httpServer.headers) {
        const hasRefs = Object.values(httpServer.headers).some(v =>
          /\$\{keychain:[^}]+\}/.test(v)
        );
        if (hasRefs) {
          warnings.push(
            `Server "${name}": \${keychain:...} in HTTP headers is not yet supported. ` +
            `The references will be left as-is. Use \${env:...} with a shell-exported variable instead.`
          );
        }
      }
      resolved[name] = server;
    }
  }

  return { servers: resolved, warnings, generatedWrappers, allRefs };
}

/**
 * Validate that keychain items exist for all refs. Returns warnings for missing items.
 */
export function validateKeychainRefs(refs: KeychainRef[]): string[] {
  const warnings: string[] = [];
  const checked = new Set<string>();

  for (const ref of refs) {
    const key = `${ref.service}/${ref.account ?? '$USER'}`;
    if (checked.has(key)) continue;
    checked.add(key);

    if (!keychainItemExists(ref.service, ref.account)) {
      const accountHint = ref.account ? `-a "${ref.account}"` : `-a "$USER"`;
      warnings.push(
        `Keychain item "${ref.service}" not found.\n` +
        `  Add it with: security add-generic-password -s "${ref.service}" ${accountHint} -w "<your-token>"`
      );
    }
  }

  return warnings;
}
