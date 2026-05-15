# mcp-sync

**Write your MCP config once, install it everywhere.**

Universal MCP (Model Context Protocol) configuration sync for AI coding harnesses — Claude Code, GitHub Copilot, OpenCode, Cursor, and more.

## The Problem

Every AI coding harness has its own MCP server config format. They're all JSON, but with different schemas, keys, file names, and locations. Teams sharing MCP configs must maintain parallel files per-harness or build custom installers.

## The Solution

Define your MCP servers once in a canonical `mcp.json`, then run one command to sync to any harness:

```bash
npx mcp-sync install                    # auto-detects harnesses, reads ./mcp.json
npx mcp-sync install --claude --copilot # target specific harnesses
npx mcp-sync install --global           # install globally
npx mcp-sync install <url>              # install from a remote config
```

## Status

🚧 **Under active development** — see [PLAN.md](PLAN.md) for the full design.

## License

MIT
