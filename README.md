# mcp-sync

**Write your MCP config once, install it everywhere.**

Every AI coding harness (Claude Code, Cursor, GitHub Copilot, Windsurf, OpenCode) has its own MCP server configuration format. They're all JSON, and they're all different.

There are lots of MCP installers / managers out there, but literally all I wanted was [skills.sh](https://skills.sh) for MCP servers. So, here we are.

`mcp-sync` lets you define your MCP servers once in a canonical `mcp.json` and sync them to any harness with one command.

## Install

```bash
npx @justinclayton/mcp-sync
```

## Usage

```bash
# Sync all servers from ./mcp.json (prompts for harness selection + confirmation)
npx @justinclayton/mcp-sync

# Specify a different config file
npx @justinclayton/mcp-sync ./path/to/mcp.json

# Load config from a URL (GitHub blob URLs work)
npx @justinclayton/mcp-sync https://github.com/acme/repo/blob/main/mcp.json

# Target specific harnesses non-interactively
npx @justinclayton/mcp-sync --to claude --to opencode --yes

# Sync only one server from the config
npx @justinclayton/mcp-sync --add terraform --to claude --yes

# Remove a server from harness configs
npx @justinclayton/mcp-sync --rm terraform --to claude

# Install to global (home directory) configs
npx @justinclayton/mcp-sync --global --yes
```

## The `mcp.json` Format

```json
{
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
    }
  }
}
```

Each server needs a `transport` (`stdio`, `http`, or `sse`) and the appropriate fields for that transport type.

## Options

| Flag | Description |
|------|-------------|
| `--to <harness>` | Target harness (repeatable): `claude`, `cursor`, `copilot`, `windsurf`, `opencode` |
| `--add <name>` | Sync only the named server from config |
| `--rm <name>` | Remove named server from target configs |
| `--global`, `-g` | Write to global harness configs |
| `--yes`, `-y` | Skip confirmation prompt |

## Supported Harnesses

| Harness | `--to` flag | Config file (project) | Config file (global) |
|---------|-------------|----------------------|---------------------|
| Claude Code | `claude` | `.mcp.json` | `~/.claude.json` |
| Cursor | `cursor` | `.cursor/mcp.json` | `~/.cursor/mcp.json` |
| GitHub Copilot | `copilot` | `.github/copilot/mcp.json` | `~/.mcp.json` |
| Windsurf | `windsurf` | `.windsurf/mcp.json` | `~/.codeium/windsurf/mcp_config.json` |
| OpenCode | `opencode` | `opencode.json` | `~/.config/opencode/opencode.json` |

## Important Note

This works best when you're referencing MCP servers that are either remote (http/sse) or **self-installing** -- using commands that will install and run in one go, such as `docker run`, `npx` (for npm), or `uvx` (for python).

## Keychain Credential Resolution (macOS)

Instead of writing wrapper scripts to pull tokens from the macOS Keychain, use the `${keychain:<service>}` template syntax directly in your `env` values:

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${keychain:github-mcp-token}"
      }
    }
  }
}
```

When `mcp-sync` encounters `${keychain:...}` references, it automatically generates a thin wrapper script at `~/.mcp-sync/wrappers/<server>.sh` that resolves the credential at runtime via `security find-generic-password`. The harness config then points to the wrapper — you never need to write or manage wrapper scripts yourself.

### Setting up Keychain items

```bash
# Add a token to the macOS Keychain
security add-generic-password -s "github-mcp-token" -a "$USER" -w "<your-token>"
```

### Account override

By default, the current `$USER` is used as the account. To specify a different account:

```json
"GITHUB_TOKEN": "${keychain:github-mcp-token/my-other-account}"
```

### Validation

During sync, `mcp-sync` checks that referenced Keychain items exist and warns (with setup instructions) if any are missing. The sync still proceeds — the wrapper will fail at MCP server start time if the item isn't resolved.

> **Note:** This feature is currently macOS-only and only supports `stdio` transport servers. `${keychain:...}` in HTTP `headers` is not yet supported.

## License

MIT
