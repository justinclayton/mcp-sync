import { claude } from './claude.ts';
import { claudeDesktop } from './claude-desktop.ts';
import { copilot } from './copilot.ts';
import { cursor } from './cursor.ts';
import { windsurf } from './windsurf.ts';
import { zed } from './zed.ts';
import { opencode } from './opencode.ts';
import { roocode } from './roocode.ts';
import { cline } from './cline.ts';
import { amazonq } from './amazonq.ts';
import type { HarnessAdapter } from './types.ts';

export const ALL_HARNESSES: HarnessAdapter[] = [
  claude,
  claudeDesktop,
  cursor,
  copilot,
  windsurf,
  zed,
  opencode,
  roocode,
  cline,
  amazonq,
];

export function getHarnessByName(name: string): HarnessAdapter | undefined {
  return ALL_HARNESSES.find(h => h.name === name);
}

export function detectHarnesses(scope: 'global' | 'project', projectDir: string): HarnessAdapter[] {
  return ALL_HARNESSES.filter(h => h.detect(scope, projectDir));
}

export { claude, claudeDesktop, copilot, cursor, windsurf, zed, opencode, roocode, cline, amazonq };
export type { HarnessAdapter } from './types.ts';
