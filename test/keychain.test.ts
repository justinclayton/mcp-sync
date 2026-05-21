import { describe, it, expect } from 'vitest';
import {
  parseKeychainRefs,
  hasKeychainRefs,
  envHasKeychainRefs,
  collectKeychainRefs,
  keychainResolveCommand,
} from '../src/keychain.ts';

describe('parseKeychainRefs', () => {
  it('parses a simple keychain reference', () => {
    const refs = parseKeychainRefs('${keychain:github-mcp-token}');
    expect(refs).toHaveLength(1);
    expect(refs[0]).toEqual({
      match: '${keychain:github-mcp-token}',
      service: 'github-mcp-token',
      account: undefined,
    });
  });

  it('parses a keychain reference with account', () => {
    const refs = parseKeychainRefs('${keychain:github-mcp-token/myaccount}');
    expect(refs).toHaveLength(1);
    expect(refs[0]).toEqual({
      match: '${keychain:github-mcp-token/myaccount}',
      service: 'github-mcp-token',
      account: 'myaccount',
    });
  });

  it('parses multiple refs in a single value', () => {
    const refs = parseKeychainRefs('Bearer ${keychain:token1} and ${keychain:token2}');
    expect(refs).toHaveLength(2);
    expect(refs[0]!.service).toBe('token1');
    expect(refs[1]!.service).toBe('token2');
  });

  it('returns empty array for no refs', () => {
    expect(parseKeychainRefs('plain-value')).toHaveLength(0);
    expect(parseKeychainRefs('${env:FOO}')).toHaveLength(0);
  });
});

describe('hasKeychainRefs', () => {
  it('returns true when keychain ref present', () => {
    expect(hasKeychainRefs('${keychain:foo}')).toBe(true);
  });

  it('returns false for plain strings', () => {
    expect(hasKeychainRefs('just a string')).toBe(false);
  });

  it('returns false for env refs', () => {
    expect(hasKeychainRefs('${env:MY_VAR}')).toBe(false);
  });
});

describe('envHasKeychainRefs', () => {
  it('returns true if any env value has keychain ref', () => {
    expect(envHasKeychainRefs({
      NORMAL: 'value',
      SECRET: '${keychain:my-secret}',
    })).toBe(true);
  });

  it('returns false for plain env', () => {
    expect(envHasKeychainRefs({ FOO: 'bar' })).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(envHasKeychainRefs(undefined)).toBe(false);
  });
});

describe('collectKeychainRefs', () => {
  it('collects refs by env key', () => {
    const result = collectKeychainRefs({
      TOKEN: '${keychain:my-token}',
      PLAIN: 'hello',
      SECRET: '${keychain:other-secret}',
    });
    expect(result.size).toBe(2);
    expect(result.has('TOKEN')).toBe(true);
    expect(result.has('SECRET')).toBe(true);
    expect(result.has('PLAIN')).toBe(false);
  });
});

describe('keychainResolveCommand', () => {
  it('generates security command with default account', () => {
    const cmd = keychainResolveCommand({ match: '', service: 'my-token' });
    expect(cmd).toBe('$(security find-generic-password -s "my-token" -a "$USER" -w)');
  });

  it('generates security command with explicit account', () => {
    const cmd = keychainResolveCommand({ match: '', service: 'my-token', account: 'bob' });
    expect(cmd).toBe('$(security find-generic-password -s "my-token" -a "bob" -w)');
  });
});
