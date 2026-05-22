/**
 * A parsed agent definition file (.md with YAML frontmatter).
 */
export interface AgentFile {
  /** Agent name — from frontmatter `name` field, or filename without extension */
  name: string;
  /** Parsed YAML frontmatter */
  frontmatter: Record<string, unknown>;
  /** Markdown body (everything after the closing ---) */
  body: string;
  /** Original filename (e.g. "track-designer.md") */
  filename: string;
}
