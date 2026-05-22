# PRD: Expand mcp-sync to support agent definitions

## Summary

Expand `mcp-sync` to sync **agent definition files** alongside MCP server configs. Same paradigm: write once, sync everywhere. The tool becomes a general-purpose "AI workspace config syncer" that handles everything that varies by IDE — currently MCPs, now also agents.

## Motivation

AI coding harnesses (Claude Code, OpenCode, Copilot, Cursor, Windsurf) each have their own format for agent definitions, just like they do for MCP configs. Teams that maintain shared agent definitions face the same fragmentation problem mcp-sync already solves for MCPs.

Today, the Jenn-AI project maintains a custom npm installer just to copy agent `.md` files into the right IDE directory with the right frontmatter format. That installer is ~800 lines of code doing what should be a 2-minute operation: "put these agent files where the IDE expects them."

Meanwhile, `vercel-labs/skills` handles skill installation well but explicitly does not handle agents or MCP configs. There's a clean separation:

- **Skills** = content that's identical everywhere → `skills` CLI
- **Config that varies by IDE** = MCPs + agents → `mcp-sync`

Adding agent sync to mcp-sync completes the picture. Two tools cover the full workspace setup. No custom installers needed.

## What are agent definitions?

Agent definitions are markdown files with YAML frontmatter that tell an AI harness how to behave in a specific role. They define:

- A name and description (routing/selection)
- Optional model preferences (`model: sonnet`)
- Optional temperature settings
- Optional permission boundaries
- A system prompt body (the markdown content)

Example (`agents/track-designer.md`):

```markdown
---
name: track-designer
description: Produces Instruqt track design specs for HashiCorp products.
model: sonnet
---

# Track Designer Agent

You are a specialist for producing Instruqt track design specifications...
```

Each harness stores these differently:

| Harness | Agent directory (project) | Agent directory (global) | Format notes |
|---------|--------------------------|--------------------------|--------------|
| Claude Code | `.claude/agents/` | `~/.claude/agents/` | Markdown with YAML frontmatter |
| OpenCode | `.opencode/agents/` | `~/.config/opencode/agents/` | Markdown with YAML frontmatter; `tools` must be YAML map, colors must be hex |
| GitHub Copilot | `.github/agents/` | `~/.copilot/agents/` | Markdown with YAML frontmatter |
| Cursor | `.cursor/agents/` | `~/.cursor/agents/` | TBD — verify format |
| Windsurf | `.windsurf/agents/` | TBD | TBD — verify format |

## Proposed UX

### Sync agents from a local directory

```bash
# Sync all agents from ./agents/ to selected harnesses
npx @justinclayton/mcp-sync agents ./agents/ --to opencode --to claude --global

# Sync a single agent file
npx @justinclayton/mcp-sync agents ./agents/track-designer.md --to opencode
```

### Sync agents from a URL

```bash
# From a GitHub repo directory
npx @justinclayton/mcp-sync agents https://github.com/hashicorp/cdl-demo-jenn-ai/tree/main/agents --to opencode --global
```

### Remove agents

```bash
# Remove an agent from harness configs
npx @justinclayton/mcp-sync agents --rm track-designer --to opencode
```

### Combined sync (MCPs + agents in one command)

```bash
# Sync everything from current directory by convention:
#   mcp.json → MCP configs
#   agents/  → agent definitions
npx @justinclayton/mcp-sync --to opencode --global
```

When no subcommand or positional source is given, the tool looks for both `mcp.json` and `agents/` in the current directory and syncs whatever it finds.

### Interactive mode

Same interactive UX as today. When flags are omitted:

1. Detect which artifact types are available (mcp.json, agents/)
2. If agents found, prompt: "Select agents to install" (multiselect with "All" option)
3. Prompt for harness selection (existing behavior)
4. Prompt for scope (existing behavior)
5. Show summary and confirm

## CLI design

```
mcp-sync [source] [options]              # existing MCP sync behavior (unchanged)
mcp-sync agents [source] [options]       # new: agent sync subcommand
mcp-sync --to <harness> [options]        # new: auto-detect and sync all (mcp.json + agents/)
```

### New flags for `agents` subcommand

| Flag | Description |
|------|-------------|
| `--to <harness>` | Target harness (repeatable) — same as today |
| `--add <name>` | Sync only the named agent |
| `--rm <name>` | Remove named agent from target harness configs |
| `--global`, `-g` | Write to global harness configs |
| `--yes`, `-y` | Skip confirmation prompt |

### Backward compatibility

All existing commands continue to work exactly as before. The `agents` subcommand is additive. The auto-detect behavior (no args) is new but only activates when there is no positional source argument or explicit subcommand — currently that case already errors with "Config file not found: mcp.json", so there's no behavioral conflict.

## Agent format: canonical and transforms

### Canonical format

The canonical agent format is **the richest superset** of all harness formats. Authors write agents once with all fields they care about. The sync tool strips unsupported fields for simpler harnesses.

```yaml
---
name: track-designer
description: Produces Instruqt track design specs.
model: sonnet
temperature: 0.1
mode: primary
color: orange
tools: "Read, Write, Edit, Bash"
permission:
  task:
    "*": deny
    "ddr-*": allow
---
```

### Per-harness transforms

| Field | Claude | OpenCode | Copilot | Cursor | Windsurf |
|-------|--------|----------|---------|--------|----------|
| `name` | ✓ as-is | ✓ as-is | ✓ as-is | TBD | TBD |
| `description` | ✓ as-is | ✓ as-is | ✓ as-is | TBD | TBD |
| `model` | ✓ as-is | ✓ as-is | strip | TBD | TBD |
| `temperature` | ✓ as-is | ✓ as-is | strip | TBD | TBD |
| `mode` | strip | ✓ as-is | strip | TBD | TBD |
| `color` | strip | ✓ name→hex | strip | TBD | TBD |
| `tools` (string) | ✓ as-is | ✓ → YAML map | ✓ as-is | TBD | TBD |
| `permission` | strip | ✓ as-is | strip | TBD | TBD |

**Transform rules:**

1. **OpenCode `tools` transform**: `tools: "Read, Write, Edit"` → `tools:\n  read: true\n  write: true\n  edit: true`
2. **OpenCode `color` transform**: `color: orange` → `color: "#FF8C00"` (named colors → hex)
3. **Field stripping**: unsupported fields are removed from frontmatter before writing. The markdown body is always passed through unchanged.

### Color map (for OpenCode)

```
red: #FF0000, green: #00FF00, blue: #0000FF, yellow: #FFFF00,
orange: #FF8C00, cyan: #00FFFF, purple: #800080, magenta: #FF00FF,
white: #FFFFFF, black: #000000, pink: #FFC0CB, gray: #808080
```

## Architecture

### New modules

```
src/
  agents/
    discover.ts     — find agent .md files in a directory or from URL
    transform.ts    — per-harness frontmatter transforms
    types.ts        — AgentFile type, transform config
  harnesses/
    types.ts        — extend HarnessAdapter with agent paths + transforms
```

### Extend HarnessAdapter

```typescript
export interface HarnessAdapter {
  // ... existing fields ...

  /** Directory name for agent definitions (project scope) */
  agentsDir(scope: 'global' | 'project', projectDir: string): string;

  /** Transform an agent's frontmatter for this harness */
  transformAgent(frontmatter: Record<string, unknown>, content: string): { frontmatter: Record<string, unknown>; content: string };
}
```

### Agent discovery

```typescript
interface AgentFile {
  /** Agent name (from frontmatter or filename) */
  name: string;
  /** Full frontmatter parsed from YAML */
  frontmatter: Record<string, unknown>;
  /** Markdown body (everything after the closing ---) */
  body: string;
  /** Original filename */
  filename: string;
}
```

Discovery reads a directory, finds all `.md` files, parses frontmatter, and returns `AgentFile[]`.

### File writing

For each harness:
1. Determine destination directory (`agentsDir()`)
2. Transform frontmatter (`transformAgent()`)
3. Re-serialize: `---\n` + YAML frontmatter + `\n---\n` + body
4. Write to `<agentsDir>/<filename>`

No manifest needed. Agent files are individual — add/remove is just file presence. Idempotent writes (overwrite if content changed, skip if identical).

## Scope

### In scope (v1)

- `agents` subcommand with local directory source
- `agents` subcommand with single-file source
- `--rm` to remove agents
- Per-harness frontmatter transforms (OpenCode tools/color, field stripping)
- Interactive agent picker (multiselect)
- Auto-detect mode (no args → sync mcp.json + agents/)
- URL source (GitHub blob/tree URLs)

### Out of scope (future)

- Agent lockfiles / version tracking
- Agent update detection (hash comparison)
- Per-agent platform overrides (e.g., `agents/foo.opencode.md`)
- Agent validation (schema enforcement on frontmatter)
- OpenCode `commands/` sync (low priority — commands are just thin agent wrappers)

## Naming

The tool stays `mcp-sync` for now. The package name, binary name, and existing behavior don't change. If agent sync proves valuable enough to warrant equal billing, a future rename to `ai-sync` or `harness-sync` can happen as a major version bump with an alias.

Alternatively, if the scope expansion feels awkward under the `mcp-sync` name, rename now:

| Option | `npx` command | Notes |
|--------|---------------|-------|
| Keep `mcp-sync` | `npx @justinclayton/mcp-sync agents ./agents/` | Existing recognition, slightly misleading name |
| Rename to `ai-sync` | `npx @justinclayton/ai-sync agents ./agents/` | Cleaner scope, breaking change for existing users |
| Rename to `harness-sync` | `npx @justinclayton/harness-sync agents ./agents/` | Most accurate, less recognizable |

**Recommendation:** Ship agent support under `mcp-sync` first. Rename later if/when it matters. Don't let naming block shipping.

## Success criteria

1. A repo with `agents/` can sync its agent definitions to any supported harness with one command
2. OpenCode-specific transforms (tools YAML, color hex) work correctly
3. Existing `mcp-sync` behavior is completely unchanged
4. Interactive mode discovers and offers both MCPs and agents when both are present
5. The Jenn-AI repo can replace its custom installer with `skills add` + `mcp-sync`

## Open questions

1. **Cursor/Windsurf agent format** — do they support agent definitions at all? If not, skip those harnesses for agent sync initially.
2. **Should auto-detect be the default?** When you run `npx @justinclayton/mcp-sync` with no args in a directory that has both `mcp.json` and `agents/`, should it offer both? Or should it remain MCP-only unless `agents` subcommand is used?
3. **Filename as identity** — should agents be identified by their filename (`track-designer.md`) or by the `name` field in frontmatter? Filename is simpler and avoids needing to parse before identifying.
4. **Field passthrough vs explicit allowlist** — should unknown frontmatter fields be passed through to all harnesses, or should each harness define an explicit allowlist? Passthrough is more future-proof; allowlist is safer.
