import { claude } from './claude.ts';
import { copilot } from './copilot.ts';
import { opencode } from './opencode.ts';
import type { HarnessAdapter } from './types.ts';

export const ALL_HARNESSES: HarnessAdapter[] = [claude, copilot, opencode];

export function getHarnessByName(name: string): HarnessAdapter | undefined {
  return ALL_HARNESSES.find(h => h.name === name);
}

export function detectHarnesses(scope: 'global' | 'project', projectDir: string): HarnessAdapter[] {
  return ALL_HARNESSES.filter(h => h.detect(scope, projectDir));
}

export { claude, copilot, opencode };
export type { HarnessAdapter } from './types.ts';
