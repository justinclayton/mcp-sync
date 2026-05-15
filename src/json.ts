import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export function readJsonFile(filePath: string, fallback: Record<string, unknown>): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJsonFile(filePath: string, value: Record<string, unknown>): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n');
}
