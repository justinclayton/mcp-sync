import { z } from 'zod';

/**
 * Canonical MCP server configuration schema.
 * This is the universal format that gets translated to each harness's native config.
 */

const StdioServerSchema = z.object({
  transport: z.literal('stdio'),
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
});

const HttpServerSchema = z.object({
  transport: z.literal('http'),
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
});

const SseServerSchema = z.object({
  transport: z.literal('sse'),
  url: z.string().url(),
  headers: z.record(z.string()).optional(),
});

export const McpServerSchema = z.discriminatedUnion('transport', [
  StdioServerSchema,
  HttpServerSchema,
  SseServerSchema,
]);

export const McpConfigSchema = z.object({
  $schema: z.string().optional(),
  mcpServers: z.record(McpServerSchema),
});

export type McpServer = z.infer<typeof McpServerSchema>;
export type StdioServer = z.infer<typeof StdioServerSchema>;
export type HttpServer = z.infer<typeof HttpServerSchema>;
export type SseServer = z.infer<typeof SseServerSchema>;
export type McpConfig = z.infer<typeof McpConfigSchema>;
