import jsYaml from 'js-yaml';

/**
 * Named color → hex mapping for OpenCode.
 * OpenCode requires hex color values; canonical format uses CSS color names.
 */
const COLOR_MAP: Record<string, string> = {
  red: '#FF0000',
  green: '#00FF00',
  blue: '#0000FF',
  yellow: '#FFFF00',
  orange: '#FF8C00',
  cyan: '#00FFFF',
  purple: '#800080',
  magenta: '#FF00FF',
  white: '#FFFFFF',
  black: '#000000',
  pink: '#FFC0CB',
  gray: '#808080',
  grey: '#808080',
};

/**
 * Transform the `tools` field from a comma-separated string to an OpenCode YAML map.
 * e.g. "Read, Write, Edit, Bash" → { read: true, write: true, edit: true, bash: true }
 */
function transformToolsForOpenCode(tools: unknown): Record<string, boolean> | unknown {
  if (typeof tools !== 'string') return tools;
  const entries = tools
    .split(',')
    .map(t => t.trim().toLowerCase())
    .filter(Boolean);
  const result: Record<string, boolean> = {};
  for (const tool of entries) {
    result[tool] = true;
  }
  return result;
}

/**
 * Transform a color name to hex for OpenCode.
 * If already a hex string, passes through unchanged.
 */
function transformColorForOpenCode(color: unknown): unknown {
  if (typeof color !== 'string') return color;
  if (color.startsWith('#')) return color;
  return COLOR_MAP[color.toLowerCase()] ?? color;
}

/**
 * Strip fields from a frontmatter object by key.
 */
function stripFields(frontmatter: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const result = { ...frontmatter };
  for (const field of fields) {
    delete result[field];
  }
  return result;
}

// Fields stripped per harness (beyond the always-kept base fields)
const CLAUDE_STRIP = ['mode', 'color', 'permission'];
const COPILOT_STRIP = ['model', 'temperature', 'mode', 'color', 'permission'];
const CURSOR_STRIP = ['mode', 'color', 'permission'];
const WINDSURF_STRIP = ['mode', 'color', 'permission'];

/**
 * Transform frontmatter for Claude Code.
 * Strips: mode, color, permission
 */
export function transformForClaude(frontmatter: Record<string, unknown>): Record<string, unknown> {
  return stripFields(frontmatter, CLAUDE_STRIP);
}

/**
 * Transform frontmatter for OpenCode.
 * - tools: string → YAML map
 * - color: name → hex
 * - Keeps all other fields
 */
export function transformForOpenCode(frontmatter: Record<string, unknown>): Record<string, unknown> {
  const result = { ...frontmatter };
  if ('tools' in result) {
    result['tools'] = transformToolsForOpenCode(result['tools']);
  }
  if ('color' in result) {
    result['color'] = transformColorForOpenCode(result['color']);
  }
  return result;
}

/**
 * Transform frontmatter for GitHub Copilot.
 * Strips: model, temperature, mode, color, permission
 */
export function transformForCopilot(frontmatter: Record<string, unknown>): Record<string, unknown> {
  return stripFields(frontmatter, COPILOT_STRIP);
}

/**
 * Transform frontmatter for Cursor.
 * Strips: mode, color, permission (TBD — conservative passthrough)
 */
export function transformForCursor(frontmatter: Record<string, unknown>): Record<string, unknown> {
  return stripFields(frontmatter, CURSOR_STRIP);
}

/**
 * Transform frontmatter for Windsurf.
 * Strips: mode, color, permission (TBD — conservative passthrough)
 */
export function transformForWindsurf(frontmatter: Record<string, unknown>): Record<string, unknown> {
  return stripFields(frontmatter, WINDSURF_STRIP);
}

/**
 * Serialize a transformed frontmatter + body back to a markdown string.
 */
export function serializeAgentFile(frontmatter: Record<string, unknown>, body: string): string {
  const yamlStr = jsYaml.dump(frontmatter, { lineWidth: -1 });
  return `---\n${yamlStr}---\n${body}`;
}
