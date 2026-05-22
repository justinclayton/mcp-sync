import type { McpServer } from '../schema.ts';

export interface HarnessAdapter {
  /** Internal identifier */
  name: string;
  /** Display name for UI */
  displayName: string;
  /** Detect whether this harness is installed/configured on the system */
  detect(scope: 'global' | 'project', projectDir: string): boolean;
  /** Get the config file path for this harness */
  configPath(scope: 'global' | 'project', projectDir: string): string;
  /** Translate canonical MCP servers to this harness's native config format */
  translate(servers: Record<string, McpServer>): Record<string, unknown>;
  /** Extract the MCP servers section from the native config (for reading existing state) */
  extractServers(nativeConfig: Record<string, unknown>): Record<string, unknown> | undefined;
  /** Merge translated servers into existing native config */
  merge(existing: Record<string, unknown>, translated: Record<string, unknown>): Record<string, unknown>;
  /** Remove server entries by name from existing native config */
  remove(existing: Record<string, unknown>, serverNames: string[]): Record<string, unknown>;

  /** Directory path for agent definitions at the given scope */
  agentsDir(scope: 'global' | 'project', projectDir: string): string;

  /**
   * Transform an agent's frontmatter for this harness.
   * Returns the (possibly modified) frontmatter and body.
   */
  transformAgent(frontmatter: Record<string, unknown>, body: string): { frontmatter: Record<string, unknown>; body: string };
}
