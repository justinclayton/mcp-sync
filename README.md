# mcp-sync

**Write your MCP config once, install it everywhere.**

Every AI coding harness (Claude Code, Claude Desktop, Cursor, GitHub Copilot, Windsurf, Zed, OpenCode, Roo Code, Cline, Amazon Q) has its own MCP server configuration format. They're all JSON, and they're all different.

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
| `--to <harness>` | Target harness (repeatable): `claude`, `claude-desktop`, `cursor`, `copilot`, `windsurf`, `zed`, `opencode`, `roocode`, `cline`, `amazonq` |
| `--add <name>` | Sync only the named server from config |
| `--rm <name>` | Remove named server from target configs |
| `--global`, `-g` | Write to global harness configs |
| `--yes`, `-y` | Skip confirmation prompt |

## Supported Harnesses

| Harness | `--to` flag | Config file (project) | Config file (global) |
|---------|-------------|----------------------|---------------------|
| Claude Code | `claude` | `.mcp.json` | `~/.claude.json` |
| Claude Desktop | `claude-desktop` | — (global only) | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Cursor | `cursor` | `.cursor/mcp.json` | `~/.cursor/mcp.json` |
| GitHub Copilot | `copilot` | `.github/copilot/mcp.json` | `~/.mcp.json` |
| Windsurf | `windsurf` | `.windsurf/mcp.json` | `~/.codeium/windsurf/mcp_config.json` |
| Zed | `zed` | `.zed/settings.json` | `~/Library/Application Support/Zed/settings.json` |
| OpenCode | `opencode` | `opencode.json` | `~/.config/opencode/opencode.json` |
| Roo Code | `roocode` | `.roo/mcp.json` | VS Code globalStorage |
| Cline | `cline` | — (global only) | VS Code globalStorage |
| Amazon Q | `amazonq` | `.amazonq/mcp.json` | `~/.amazonq/mcp.json` |

## Important Note

This works best when you're referencing MCP servers that are either remote (http/sse) or **self-installing** -- using commands that will install and run in one go, such as `docker run`, `npx` (for npm), or `uvx` (for python).

## License

MIT
