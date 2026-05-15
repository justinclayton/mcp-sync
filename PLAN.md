# mcp-sync

**Write your MCP config once, install it everywhere.**

## Problem

Every AI coding harness (Claude Code, GitHub Copilot, OpenCode, Cursor, Windsurf, Zed, Cline, Continue...) has its own MCP server configuration format. They're all JSON, but:

- Different top-level keys (`mcpServers` vs `mcp`)
- Different type enums (`"stdio"` vs `"local"` vs omitted)
- Different command representations (`command` + `args` vs single `command` array)
- Different file names and locations (`.mcp.json`, `opencode.json`, `~/.claude.json`, etc.)
- Different scoping rules (global vs project)

This means teams sharing MCP configs must either maintain parallel config files per-harness or build custom installers. Neither scales.

## Solution

A single canonical `mcp.json` format + a CLI that translates and writes the correct native config for any supported harness.

## UX

```bash
# Install from local mcp.json (auto-detects installed harnesses)
npx mcp-sync install

# Target specific harnesses
npx mcp-sync install --claude --opencode

# Install globally (available in all projects)
npx mcp-sync install --global

# Install from a remote URL (teams share a single source of truth)
npx mcp-sync install https://github.com/acme/eng-tools/blob/main/mcp.json
npx mcp-sync install gh:acme/eng-tools/mcp.json

# Interactive: pick which MCPs to install from a multi-server config
npx mcp-sync install --pick

# See what's installed and where
npx mcp-sync status

# See drift between source config and installed state
npx mcp-sync diff

# Remove MCP configs installed by mcp-sync
npx mcp-sync uninstall
```

## Canonical Format: `mcp.json`

```jsonc
{
  "$schema": "https://mcp-sync.dev/schema.json",
  "mcpServers": {
    "github": {
      "transport": "http",
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": {
        "Authorization": "Bearer ${env:GH_TOKEN}"
      }
    },
    "terraform": {
      "transport": "stdio",
      "command": "docker",
      "args": ["run", "-i", "--rm", "hashicorp/terraform-mcp-server:0.5.1"],
      "env": {
        "TFE_TOKEN": "${env:TFE_TOKEN}"
      }
    },
    "postgres": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "${env:DATABASE_URL}"]
    }
  }
}
```

### Format Design Decisions

| Choice | Rationale |
|--------|-----------|
| `mcpServers` top-level key | Matches Claude/Copilot convention; familiar to most users |
| `transport`: `"stdio"` / `"http"` / `"sse"` | Explicit transport type — the tool needs this to generate correct native config |
| `${env:VAR}` for secrets | Explicit interpolation syntax; never writes raw secrets to disk |
| No harness-specific sections | That's the whole point — one format, multiple targets |
| JSON with optional `$schema` | IDE autocompletion + validation for free |

## Target Output Examples

Given the canonical config above, `mcp-sync install --claude --copilot --opencode` writes:

### Claude Code (`~/.claude.json` or `.mcp.json`)

```json
{
  "mcpServers": {
    "github": {
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": { "Authorization": "Bearer ${GH_TOKEN}" }
    },
    "terraform": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "-e", "TFE_TOKEN", "hashicorp/terraform-mcp-server:0.5.1"]
    }
  }
}
```

### GitHub Copilot (`.mcp.json`)

```json
{
  "mcpServers": {
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": { "Authorization": "Bearer ${GH_TOKEN}" }
    },
    "terraform": {
      "type": "stdio",
      "command": "docker",
      "args": ["run", "-i", "--rm", "-e", "TFE_TOKEN", "hashicorp/terraform-mcp-server:0.5.1"]
    }
  }
}
```

### OpenCode (`opencode.json`)

```json
{
  "mcp": {
    "github": {
      "type": "remote",
      "url": "https://api.githubcopilot.com/mcp/",
      "headers": { "Authorization": "Bearer ${GH_TOKEN}" }
    },
    "terraform": {
      "type": "local",
      "command": ["docker", "run", "-i", "--rm", "-e", "TFE_TOKEN", "hashicorp/terraform-mcp-server:0.5.1"]
    }
  }
}
```

## Architecture

```
src/
  index.ts              # CLI entry point
  schema.ts             # canonical mcp.json schema (Zod) + validation
  resolve.ts            # load from file/URL, resolve ${env:*} references
  detect.ts             # auto-detect which harnesses are installed
  install.ts            # orchestrate: resolve → translate → write
  status.ts             # read installed state, compare to source
  harnesses/
    types.ts            # shared harness adapter interface
    claude.ts           # Claude Code config translation + paths
    copilot.ts          # GitHub Copilot config translation + paths
    opencode.ts         # OpenCode config translation + paths
    cursor.ts           # Cursor config translation + paths
  utils/
    json.ts             # safe JSON read/write with merge semantics
    env.ts              # ${env:VAR} interpolation
    paths.ts            # XDG/platform-aware config paths
```

### Harness Adapter Interface

```typescript
interface HarnessAdapter {
  name: string;                           // "claude", "copilot", "opencode"
  displayName: string;                    // "Claude Code", "GitHub Copilot"
  detect(): boolean;                      // is this harness installed?
  configPath(scope: 'global' | 'project', projectDir?: string): string;
  translate(servers: CanonicalMcpServers): NativeConfig;
  read(scope: 'global' | 'project', projectDir?: string): InstalledServers;
}
```

Each adapter is ~40-60 lines. Adding support for a new harness is a single-file PR.

## Implementation Plan

### Phase 1: MVP (v0.1.0)

- [ ] Canonical schema definition (Zod)
- [ ] Harness adapters: Claude, Copilot, OpenCode
- [ ] `mcp-sync install` from local `mcp.json`
- [ ] `--global` vs project-local scoping
- [ ] `--pick` interactive server selection
- [ ] `${env:VAR}` interpolation (resolve at translation time vs passthrough — harness-dependent)
- [ ] Merge semantics: don't clobber existing MCP configs, only add/update mcp-sync-managed entries
- [ ] `mcp-sync status` — show what's installed where

### Phase 2: Remote Sources (v0.2.0)

- [ ] `mcp-sync install <url>` — fetch from GitHub raw URL, gist, or any HTTPS endpoint
- [ ] `gh:owner/repo/path` shorthand
- [ ] Cache + offline support
- [ ] `mcp-sync diff` — show drift between source and installed

### Phase 3: Ecosystem (v0.3.0)

- [ ] Additional harness adapters: Cursor, Windsurf, Zed, Cline, Continue
- [ ] `mcp-sync uninstall` — clean removal of managed entries
- [ ] JSON Schema published at `https://mcp-sync.dev/schema.json`
- [ ] `mcp-sync init` — generate starter `mcp.json` from existing harness configs (reverse sync)

## Key Design Principles

1. **Additive, not destructive** — `mcp-sync install` merges into existing configs. Never removes entries it didn't create. Uses a `_mcp-sync` metadata key or sidecar manifest to track ownership.

2. **Secrets never written to disk** — `${env:VAR}` is either passed through as the harness's native env var syntax, or resolved at runtime only. Never expanded into config files.

3. **Zero dependencies at runtime** — ships as a single-file CLI if possible. No node_modules tree for users to worry about.

4. **Harness-native output** — the generated configs should look hand-written. No weird wrappers or comments that confuse harness parsers.

5. **Idempotent** — running `install` twice produces the same result. Safe to put in dotfiles bootstrap scripts.

## Open Questions

- **Env var handling**: Some harnesses natively support `${VAR}` in their configs (Claude does). Others don't. Should we passthrough when possible and error when not? Or always resolve at install time?
- **Tracking ownership**: How do we know which entries in a harness config were written by mcp-sync? Options: `_mcp-sync` key in the JSON, separate manifest file, or comment convention.
- **Config file location**: `mcp.json` at project root? Or `~/.config/mcp-sync/config.json` for global? Both?
- **Monorepo support**: Should we support per-workspace configs that inherit from a root?

## Tech Stack

- TypeScript (compiled to single CJS file via esbuild for zero-dep `npx` execution)
- Zod for schema validation
- No framework — just `fs`, `path`, `readline` for prompts
- Vitest for testing

## Name Availability

- ✅ `mcp-sync` available on npm (verified 2025-05-15)
- ✅ `github.com/justinclayton/mcp-sync` created
