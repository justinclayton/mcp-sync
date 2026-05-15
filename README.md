# mcp-sync

**Write your MCP config once, install it everywhere.**

Every AI coding harness (Claude Code, GitHub Copilot, OpenCode, Cursor...) has its own MCP server configuration format. They're all JSON, but with different schemas, keys, file names, and locations.

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

## Supported Harnesses

| Harness | `--to` flag | Config file (project) | Config file (global) |
|---------|-------------|----------------------|---------------------|
| Claude Code | `claude` | `.mcp.json` | `~/.claude.json` |
| GitHub Copilot | `copilot` | `.mcp.json` | `~/.mcp.json` |
| OpenCode | `opencode` | `opencode.json` | `~/.config/opencode/opencode.json` |

## How It Works

`mcp-sync` translates your canonical config to each harness's native format:

- **Claude**: `mcpServers.{name}` with `command`/`args` (no type field)
- **Copilot**: `mcpServers.{name}` with `type: "stdio"/"http"` + `command`/`args`
- **OpenCode**: `mcp.{name}` with `type: "local"/"remote"` + `command` as array

Existing config is preserved — `mcp-sync` only adds/updates the servers it manages.

## Options

| Flag | Description |
|------|-------------|
| `--to <harness>` | Target harness (repeatable): `claude`, `copilot`, `opencode` |
| `--add <name>` | Sync only the named server from config |
| `--rm <name>` | Remove named server from target configs |
| `--global`, `-g` | Write to global harness configs |
| `--yes`, `-y` | Skip confirmation prompt |

## License

MIT
