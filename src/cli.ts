import * as p from '@clack/prompts';
import pc from 'picocolors';
import { resolve, basename } from 'path';
import { existsSync } from 'fs';
import { loadConfig } from './resolve.ts';
import { readJsonFile, writeJsonFile } from './json.ts';
import { ALL_HARNESSES, getHarnessByName, type HarnessAdapter } from './harnesses/index.ts';
import type { McpConfig, McpServer } from './schema.ts';

const VERSION = '0.1.0';

interface CliOptions {
  source: string;
  add?: string;
  rm?: string;
  to: string[];
  global: boolean;
  yes: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const args = argv.slice(2);
  const options: CliOptions = {
    source: 'mcp.json',
    to: [],
    global: false,
    yes: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    if (arg === '--version' || arg === '-v') {
      console.log(VERSION);
      process.exit(0);
    }

    if (arg === '--global' || arg === '-g') {
      options.global = true;
      continue;
    }

    if (arg === '--yes' || arg === '-y') {
      options.yes = true;
      continue;
    }

    if (arg === '--add') {
      if (!args[i + 1] || args[i + 1]!.startsWith('-')) {
        console.error(pc.red('--add requires a server name'));
        process.exit(1);
      }
      options.add = args[++i];
      continue;
    }

    if (arg === '--rm') {
      if (!args[i + 1] || args[i + 1]!.startsWith('-')) {
        console.error(pc.red('--rm requires a server name'));
        process.exit(1);
      }
      options.rm = args[++i];
      continue;
    }

    if (arg === '--to') {
      if (!args[i + 1] || args[i + 1]!.startsWith('-')) {
        console.error(pc.red('--to requires a harness name'));
        process.exit(1);
      }
      options.to.push(args[++i]!);
      continue;
    }

    if (arg.startsWith('-')) {
      console.error(pc.red(`Unknown flag: ${arg}`));
      process.exit(1);
    }

    // Positional: source file or URL
    options.source = arg;
  }

  return options;
}

function printHelp(): void {
  console.log(`
${pc.bold('mcp-sync')} — Write your MCP config once, install it everywhere.

${pc.bold('Usage:')}
  npx @justinclayton/mcp-sync [source] [options]

${pc.bold('Arguments:')}
  source              Path or URL to mcp.json (default: ./mcp.json)

${pc.bold('Options:')}
  --to <harness>      Target harness (claude, copilot, opencode). Repeatable.
  --add <name>        Sync only the named server from the config
  --rm <name>         Remove the named server from target harness configs
  --global, -g        Write to global (home directory) harness configs
  --yes, -y           Skip confirmation prompt
  --help, -h          Show this help
  --version, -v       Show version

${pc.bold('Examples:')}
  ${pc.dim('$')} npx @justinclayton/mcp-sync
  ${pc.dim('$')} npx @justinclayton/mcp-sync ./my-mcps.json
  ${pc.dim('$')} npx @justinclayton/mcp-sync https://github.com/acme/repo/blob/main/mcp.json
  ${pc.dim('$')} npx @justinclayton/mcp-sync --add github
  ${pc.dim('$')} npx @justinclayton/mcp-sync --rm terraform --to claude
  ${pc.dim('$')} npx @justinclayton/mcp-sync --global --yes
`);
}

async function selectHarnesses(scope: 'global' | 'project', projectDir: string): Promise<HarnessAdapter[]> {
  const options = ALL_HARNESSES.map(h => ({
    value: h,
    label: h.displayName,
    hint: h.detect(scope, projectDir) ? 'detected' : undefined,
  }));

  const selected = await p.multiselect({
    message: 'Which harnesses should we install to?',
    options,
    required: true,
  });

  if (p.isCancel(selected)) {
    p.cancel('Cancelled.');
    process.exit(0);
  }

  return selected as HarnessAdapter[];
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv);
  const projectDir = process.cwd();
  const scope = options.global ? 'global' : 'project';

  p.intro(pc.bold('mcp-sync'));

  // --- Handle --rm (doesn't need source file) ---
  if (options.rm) {
    const harnesses = options.to.length > 0
      ? options.to.map(name => {
          const h = getHarnessByName(name);
          if (!h) { p.cancel(`Unknown harness: ${name}`); process.exit(1); }
          return h;
        })
      : await selectHarnesses(scope, projectDir);

    for (const harness of harnesses) {
      const configFile = harness.configPath(scope, projectDir);
      const existing = readJsonFile(configFile, {});
      const updated = harness.remove(existing, [options.rm]);
      writeJsonFile(configFile, updated);
      p.log.success(`Removed ${pc.bold(options.rm)} from ${harness.displayName} ${pc.dim(`(${configFile})`)}`);
    }

    p.outro('Done!');
    return;
  }

  // --- Load source config ---
  const sourcePath = options.source.startsWith('http')
    ? options.source
    : resolve(projectDir, options.source);

  if (!options.source.startsWith('http') && !existsSync(sourcePath)) {
    p.cancel(`Config file not found: ${sourcePath}`);
    process.exit(1);
  }

  const spinner = p.spinner();
  spinner.start('Loading config');

  let config: McpConfig;
  try {
    config = await loadConfig(sourcePath);
  } catch (err) {
    spinner.stop('Failed to load config');
    p.cancel((err as Error).message);
    process.exit(1);
  }

  spinner.stop('Config loaded');

  // --- Determine which servers to sync ---
  let servers: Record<string, McpServer>;
  if (options.add) {
    if (!(options.add in config.mcpServers)) {
      p.cancel(`Server "${options.add}" not found in config. Available: ${Object.keys(config.mcpServers).join(', ')}`);
      process.exit(1);
    }
    servers = { [options.add]: config.mcpServers[options.add]! };
  } else {
    servers = config.mcpServers;
  }

  const serverNames = Object.keys(servers);
  if (serverNames.length === 0) {
    p.cancel('No MCP servers defined in config.');
    process.exit(1);
  }

  // --- Determine target harnesses ---
  let harnesses: HarnessAdapter[];
  if (options.to.length > 0) {
    harnesses = options.to.map(name => {
      const h = getHarnessByName(name);
      if (!h) { p.cancel(`Unknown harness: ${name}. Available: ${ALL_HARNESSES.map(h => h.name).join(', ')}`); process.exit(1); }
      return h;
    });
  } else {
    harnesses = await selectHarnesses(scope, projectDir);
  }

  // --- Confirm ---
  const scopeLabel = options.global ? 'globally' : 'to this project';

  if (!options.yes) {
    p.log.info(
      `Will sync ${pc.bold(String(serverNames.length))} server(s) to ${pc.bold(String(harnesses.length))} harness(es) ${scopeLabel}:`
    );
    for (const name of serverNames) {
      const server = servers[name]!;
      p.log.message(`  ${pc.green('•')} ${pc.bold(name)} ${pc.dim(`(${server.transport})`)}`);
    }
    p.log.message(`  → ${harnesses.map(h => h.displayName).join(', ')}`);

    const confirmed = await p.confirm({ message: 'Proceed?' });
    if (p.isCancel(confirmed) || !confirmed) {
      p.cancel('Cancelled.');
      process.exit(0);
    }
  }

  // --- Write configs ---
  for (const harness of harnesses) {
    const configFile = harness.configPath(scope, projectDir);
    const existing = readJsonFile(configFile, {});
    const translated = harness.translate(servers);
    const merged = harness.merge(existing, translated);
    writeJsonFile(configFile, merged);
    p.log.success(`${harness.displayName} ${pc.dim(`(${configFile})`)}`);
  }

  p.outro(`Synced ${serverNames.length} server(s) to ${harnesses.length} harness(es). ${pc.green('✓')}`);
}

main().catch((err) => {
  p.cancel((err as Error).message ?? String(err));
  process.exit(1);
});
