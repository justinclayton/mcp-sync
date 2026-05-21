import { execSync } from 'child_process';
import { platform } from 'os';

/**
 * Regex to match ${keychain:<service>} or ${keychain:<service>/<account>} templates.
 */
export const KEYCHAIN_TEMPLATE_RE = /\$\{keychain:([^}]+)\}/g;

export interface KeychainRef {
  /** The full match, e.g. "${keychain:github-mcp-token}" */
  match: string;
  /** The service name for the keychain item */
  service: string;
  /** Optional account override (defaults to $USER at runtime) */
  account?: string;
}

/**
 * Parse all ${keychain:...} references from a string value.
 */
export function parseKeychainRefs(value: string): KeychainRef[] {
  const refs: KeychainRef[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(KEYCHAIN_TEMPLATE_RE.source, 'g');
  while ((m = re.exec(value)) !== null) {
    const body = m[1]!;
    const slashIdx = body.indexOf('/');
    if (slashIdx > 0) {
      refs.push({
        match: m[0],
        service: body.slice(0, slashIdx),
        account: body.slice(slashIdx + 1),
      });
    } else {
      refs.push({ match: m[0], service: body });
    }
  }
  return refs;
}

/**
 * Check if a string contains any ${keychain:...} references.
 */
export function hasKeychainRefs(value: string): boolean {
  return /\$\{keychain:[^}]+\}/.test(value);
}

/**
 * Check whether env values in a record contain any keychain references.
 */
export function envHasKeychainRefs(env: Record<string, string> | undefined): boolean {
  if (!env) return false;
  return Object.values(env).some(v => hasKeychainRefs(v));
}

/**
 * Collect all keychain references from a server's env.
 */
export function collectKeychainRefs(env: Record<string, string> | undefined): Map<string, KeychainRef[]> {
  const result = new Map<string, KeychainRef[]>();
  if (!env) return result;
  for (const [key, value] of Object.entries(env)) {
    const refs = parseKeychainRefs(value);
    if (refs.length > 0) {
      result.set(key, refs);
    }
  }
  return result;
}

/**
 * Check if a keychain item exists on macOS.
 * Returns true if found, false otherwise.
 * On non-macOS platforms, always returns false.
 */
export function keychainItemExists(service: string, account?: string): boolean {
  if (platform() !== 'darwin') return false;
  try {
    const accountFlag = account ? `-a "${account}"` : `-a "$USER"`;
    execSync(
      `security find-generic-password -s "${service}" ${accountFlag} 2>/dev/null`,
      { stdio: 'pipe' }
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Generate the shell command to resolve a keychain reference.
 */
export function keychainResolveCommand(ref: KeychainRef): string {
  const accountFlag = ref.account
    ? `-a "${ref.account}"`
    : `-a "$USER"`;
  return `$(security find-generic-password -s "${ref.service}" ${accountFlag} -w)`;
}
