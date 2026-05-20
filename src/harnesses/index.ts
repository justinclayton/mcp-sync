import { claude } from './claude.ts';
import { copilot } from './copilot.ts';
import { cursor } from './cursor.ts';
import { windsurf } from './windsurf.ts';
import { opencode } from './opencode.ts';
import type { HarnessAdapter } from './types.ts';

export const ALL_HARNESSES: HarnessAdapter[] = [
  claude,
  cursor,
  copilot,
  windsurf,
  opencode,
];

export function getHarnessByName(name: string): HarnessAdapter | undefined {
  return ALL_HARNESSES.find(h => h.name === name);
}

export function detectHarnesses(scope: 'global' | 'project', projectDir: string): HarnessAdapter[] {
  return ALL_HARNESSES.filter(h => h.detect(scope, projectDir));
}

export { claude, copilot, cursor, windsurf, opencode };
export type { HarnessAdapter } from './types.ts';
