import { z } from 'zod';

/**
 * Canonical MCP server configuration schema.
 * Matches Claude Code's .mcp.json format — the dominant harness.
 * Transport is inferred: `command` present → stdio, `url` present → http/streamable.
 */

const StdioServerSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
}).strict();

const HttpServerSchema = z.object({
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
}).strict();

export const McpServerSchema = z.union([StdioServerSchema, HttpServerSchema]);

export const McpConfigSchema = z.object({
  $schema: z.string().optional(),
  mcpServers: z.record(McpServerSchema),
});

export type McpServer = z.infer<typeof McpServerSchema>;
export type StdioServer = z.infer<typeof StdioServerSchema>;
export type HttpServer = z.infer<typeof HttpServerSchema>;
export type McpConfig = z.infer<typeof McpConfigSchema>;

/** Determine transport type from server shape */
export function getTransport(server: McpServer): 'stdio' | 'http' {
  return 'command' in server ? 'stdio' : 'http';
}
