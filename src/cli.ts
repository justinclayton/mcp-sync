import * as p from '@clack/prompts';
import pc from 'picocolors';
import { resolve, basename } from 'path';
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, statSync } from 'fs';
import { loadConfig } from './resolve.ts';
import { readJsonFile, writeJsonFile } from './json.ts';
import { ALL_HARNESSES, getHarnessByName, type HarnessAdapter } from './harnesses/index.ts';
import type { McpConfig, McpServer } from './schema.ts';
import { getTransport } from './schema.ts';
import { resolveKeychainServers, validateKeychainRefs } from './resolve-keychain.ts';
import { removeWrapper } from './wrappers.ts';
import { discoverAgents } from './agents/discover.ts';
import { serializeAgentFile } from './agents/transform.ts';
import type { AgentFile } from './agents/types.ts';

import pkg from '../package.json';
const VERSION = pkg.version;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface McpCliOptions {
  source: string;
  sourceExplicit: boolean;
  add?: string;
  rm?: string;
  to: string[];
  global: boolean;
  yes: boolean;
}

interface AgentCliOptions {
  source?: string;
  add?: string;
  rm?: string;
  to: string[];
  global: boolean;
  yes: boolean;
}

type Mode = 'mcp' | 'agents' | 'auto';

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

interface ParsedArgs {
  mode: Mode;
  mcpOptions: McpCliOptions;
  agentOptions: AgentCliOptions;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);

  const mcpOptions: McpCliOptions = {
    source: 'mcp.json',
    sourceExplicit: false,
    to: [],
    global: false,
    yes: false,
  };

  const agentOptions: AgentCliOptions = {
    to: [],
    global: false,
    yes: false,
  };

  let mode: Mode = 'auto';
  let i = 0;

  // Check if first positional arg is 'agents' subcommand
  if (args[0] === 'agents') {
    mode = 'agents';
    i = 1;
  }

  for (; i < args.length; i++) {
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
      mcpOptions.global = true;
      agentOptions.global = true;
      continue;
    }

    if (arg === '--yes' || arg === '-y') {
      mcpOptions.yes = true;
      agentOptions.yes = true;
      continue;
    }

    if (arg === '--add') {
      if (!args[i + 1] || args[i + 1]!.startsWith('-')) {
        console.error(pc.red('--add requires a name'));
        process.exit(1);
      }
      const val = args[++i]!;
      mcpOptions.add = val;
      agentOptions.add = val;
      continue;
    }

    if (arg === '--rm') {
      if (!args[i + 1] || args[i + 1]!.startsWith('-')) {
        console.error(pc.red('--rm requires a name'));
        process.exit(1);
      }
      const val = args[++i]!;
      mcpOptions.rm = val;
      agentOptions.rm = val;
      continue;
    }

    if (arg === '--to') {
      if (!args[i + 1] || args[i + 1]!.startsWith('-')) {
        console.error(pc.red('--to requires a harness name'));
        process.exit(1);
      }
      const val = args[++i]!;
      mcpOptions.to.push(val);
      agentOptions.to.push(val);
      continue;
    }

    if (arg.startsWith('-')) {
      console.error(pc.red(`Unknown flag: ${arg}`));
      process.exit(1);
    }

    // Positional arg
    if (mode === 'agents') {
      agentOptions.source = arg;
    } else {
      mode = 'mcp';
      mcpOptions.source = arg;
      mcpOptions.sourceExplicit = true;
    }
  }

  return { mode, mcpOptions, agentOptions };
}

function printHelp(): void {
  console.log(`
${pc.bold('mcp-sync')} — Write your MCP config once, install it everywhere.

${pc.bold('Usage:')}
  npx @justinclayton/mcp-sync [source] [options]           # sync MCP servers
  npx @justinclayton/mcp-sync agents [source] [options]   # sync agent definitions
  npx @justinclayton/mcp-sync [options]                    # auto-detect mcp.json + agents/

${pc.bold('Arguments:')}
  source              Path or URL to mcp.json (default: ./mcp.json)
                      For agents: path to agents/ directory, a single .md file, or URL

${pc.bold('Options:')}
  --to <harness>      Target harness (claude, cursor, copilot, windsurf,
                      opencode). Repeatable.
  --add <name>        Sync only the named server/agent from the source
  --rm <name>         Remove the named server/agent from target harness configs
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
  ${pc.dim('$')} npx @justinclayton/mcp-sync agents ./agents/
  ${pc.dim('$')} npx @justinclayton/mcp-sync agents ./agents/ --to opencode --to claude --global
  ${pc.dim('$')} npx @justinclayton/mcp-sync agents https://github.com/acme/repo/tree/main/agents --to opencode --global
  ${pc.dim('$')} npx @justinclayton/mcp-sync agents --rm track-designer --to opencode
  ${pc.dim('$')} npx @justinclayton/mcp-sync --global --yes
`);
}

// ---------------------------------------------------------------------------
// Shared interactive helpers
// ---------------------------------------------------------------------------

async function selectScope(): Promise<'project' | 'global'> {
  const selected = await p.select({
    message: 'Installation scope',
    options: [
      { value: 'project' as const, label: 'Project', hint: 'install in this project only' },
      { value: 'global' as const, label: 'Global', hint: 'install in home directory (available across all projects)' },
    ],
  });

  if (p.isCancel(selected)) {
    p.cancel('Cancelled.');
    process.exit(0);
  }

  return selected as 'project' | 'global';
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

// ---------------------------------------------------------------------------
// MCP sync (existing behavior, completely unchanged)
// ---------------------------------------------------------------------------

async function selectServers(servers: Record<string, McpServer>): Promise<Record<string, McpServer>> {
  const serverNames = Object.keys(servers);

  if (serverNames.length === 1) {
    return servers;
  }

  const ALL_SENTINEL = '__all__';
  const options = [
    { value: ALL_SENTINEL, label: 'All', hint: `${serverNames.length} servers` },
    ...serverNames.map(name => ({
      value: name,
      label: name,
      hint: getTransport(servers[name]!),
    })),
  ];

  const selected = await p.multiselect({
    message: 'Select MCP servers to install (space to toggle)',
    options,
    required: true,
  });

  if (p.isCancel(selected)) {
    p.cancel('Cancelled.');
    process.exit(0);
  }

  const selectedValues = selected as string[];

  if (selectedValues.includes(ALL_SENTINEL)) {
    return servers;
  }

  const result: Record<string, McpServer> = {};
  for (const name of selectedValues) {
    result[name] = servers[name]!;
  }
  return result;
}

async function runMcpSync(options: McpCliOptions, projectDir: string): Promise<void> {
  const scope = options.global ? 'global' : 'project';

  // --- Handle --rm (doesn't need source file) ---
  if (options.rm) {
    const harnesses: HarnessAdapter[] = options.to.length > 0
      ? options.to.map(name => {
          const h = getHarnessByName(name);
          if (!h) { p.cancel(`Unknown harness: ${name}`); process.exit(1); }
          return h!;
        })
      : await selectHarnesses(scope, projectDir);

    for (const harness of harnesses) {
      const configFile = harness.configPath(scope, projectDir);
      const existing = readJsonFile(configFile, {});
      const updated = harness.remove(existing, [options.rm]);
      writeJsonFile(configFile, updated);
      p.log.success(`Removed ${pc.bold(options.rm)} from ${harness.displayName} ${pc.dim(`(${configFile})`)}`);
    }

    if (removeWrapper(options.rm)) {
      p.log.info(`Removed keychain wrapper for ${pc.bold(options.rm)}`);
    }

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

  let config!: McpConfig;
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
  } else if (options.yes) {
    servers = config.mcpServers;
  } else {
    servers = await selectServers(config.mcpServers);
  }

  const serverNames = Object.keys(servers);
  if (serverNames.length === 0) {
    p.cancel('No MCP servers defined in config.');
    process.exit(1);
  }

  p.log.info(`Found ${pc.green(String(serverNames.length))} server(s)`);

  // --- Resolve ${keychain:...} references ---
  const keychainResult = resolveKeychainServers(servers, sourcePath.toString());

  for (const warning of keychainResult.warnings) {
    p.log.warn(pc.yellow(warning));
  }

  if (keychainResult.allRefs.length > 0) {
    const validationWarnings = validateKeychainRefs(keychainResult.allRefs);
    for (const warning of validationWarnings) {
      p.log.warn(pc.yellow(`⚠ ${warning}`));
    }
    if (keychainResult.generatedWrappers.length > 0) {
      p.log.info(
        `Generated ${pc.green(String(keychainResult.generatedWrappers.length))} keychain wrapper(s)`
      );
    }
  }

  servers = keychainResult.servers;

  // --- Determine target harnesses ---
  let harnesses: HarnessAdapter[];
  if (options.to.length > 0) {
    harnesses = options.to.map(name => {
      const h = getHarnessByName(name);
      if (!h) { p.cancel(`Unknown harness: ${name}. Available: ${ALL_HARNESSES.map(h => h.name).join(', ')}`); process.exit(1); }
      return h!;
    });
  } else {
    harnesses = await selectHarnesses(scope, projectDir);
  }

  // --- Determine scope ---
  if (!options.global && !options.yes && !options.to.length) {
    const selectedScope = await selectScope();
    if (selectedScope === 'global') {
      options.global = true;
    }
  }

  const finalScope = options.global ? 'global' : 'project';
  const scopeLabel = options.global ? 'globally' : 'to this project';

  // --- Confirm ---
  if (!options.yes) {
    p.log.info(
      `Will sync ${pc.bold(String(serverNames.length))} server(s) to ${pc.bold(String(harnesses.length))} harness(es) ${scopeLabel}:`
    );
    for (const name of serverNames) {
      const server = servers[name]!;
      p.log.message(`  ${pc.green('•')} ${pc.bold(name)} ${pc.dim(`(${getTransport(server)})`)}`);
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
    const configFile = harness.configPath(finalScope, projectDir);
    const existing = readJsonFile(configFile, {});

    if (!options.yes && existsSync(configFile) && Object.keys(existing).length > 0) {
      const overwrite = await p.confirm({
        message: `${configFile} already exists. Overwrite?`,
      });
      if (p.isCancel(overwrite) || !overwrite) {
        p.log.warn(`Skipped ${harness.displayName}`);
        continue;
      }
    }

    const translated = harness.translate(servers);
    const merged = harness.merge(existing, translated);
    writeJsonFile(configFile, merged);
    p.log.success(`${harness.displayName} ${pc.dim(`(${configFile})`)}`);
  }

  p.outro(`Synced ${serverNames.length} server(s) to ${harnesses.length} harness(es). ${pc.green('✓')}`);
}

// ---------------------------------------------------------------------------
// Agent sync (new)
// ---------------------------------------------------------------------------

async function selectAgents(agents: AgentFile[]): Promise<AgentFile[]> {
  if (agents.length === 1) {
    return agents;
  }

  const ALL_SENTINEL = '__all__';
  const options = [
    { value: ALL_SENTINEL, label: 'All', hint: `${agents.length} agents` },
    ...agents.map(a => ({ value: a.name, label: a.name, hint: a.filename })),
  ];

  const selected = await p.multiselect({
    message: 'Select agents to install (space to toggle)',
    options,
    required: true,
  });

  if (p.isCancel(selected)) {
    p.cancel('Cancelled.');
    process.exit(0);
  }

  const selectedValues = selected as string[];

  if (selectedValues.includes(ALL_SENTINEL)) {
    return agents;
  }

  return agents.filter(a => selectedValues.includes(a.name));
}

async function runAgentSync(options: AgentCliOptions, projectDir: string): Promise<void> {
  const scope = options.global ? 'global' : 'project';

  // --- Handle --rm ---
  if (options.rm) {
    const harnesses: HarnessAdapter[] = options.to.length > 0
      ? options.to.map(name => {
          const h = getHarnessByName(name);
          if (!h) { p.cancel(`Unknown harness: ${name}`); process.exit(1); }
          return h!;
        })
      : await selectHarnesses(scope, projectDir);

    for (const harness of harnesses) {
      const dir = harness.agentsDir(scope, projectDir);
      const filePath = resolve(dir, `${options.rm}.md`);
      if (existsSync(filePath)) {
        unlinkSync(filePath);
        p.log.success(`Removed agent ${pc.bold(options.rm)} from ${harness.displayName} ${pc.dim(`(${filePath})`)}`);
      } else {
        p.log.warn(`Agent ${pc.bold(options.rm)} not found in ${harness.displayName} ${pc.dim(`(${dir})`)}`);
      }
    }

    p.outro('Done!');
    return;
  }

  // --- Discover agents ---
  const sourcePath = options.source
    ? (options.source.startsWith('http') ? options.source : resolve(projectDir, options.source))
    : resolve(projectDir, 'agents');

  const spinner = p.spinner();
  spinner.start('Discovering agents');

  let allAgents!: AgentFile[];
  try {
    allAgents = await discoverAgents(sourcePath);
  } catch (err) {
    spinner.stop('Failed to discover agents');
    p.cancel((err as Error).message);
    process.exit(1);
  }

  spinner.stop(`Found ${allAgents.length} agent(s)`);

  if (allAgents.length === 0) {
    p.cancel('No agent files found.');
    process.exit(1);
  }

  // Filter to --add target if specified
  let agents: AgentFile[];
  if (options.add) {
    agents = allAgents.filter(a => a.name === options.add || a.filename === options.add || a.filename === `${options.add}.md`);
    if (agents.length === 0) {
      p.cancel(`Agent "${options.add}" not found. Available: ${allAgents.map(a => a.name).join(', ')}`);
      process.exit(1);
    }
  } else if (options.yes) {
    agents = allAgents;
  } else {
    agents = await selectAgents(allAgents);
  }

  p.log.info(`Selected ${pc.green(String(agents.length))} agent(s)`);

  // --- Determine target harnesses ---
  let harnesses: HarnessAdapter[];
  if (options.to.length > 0) {
    harnesses = options.to.map(name => {
      const h = getHarnessByName(name);
      if (!h) { p.cancel(`Unknown harness: ${name}. Available: ${ALL_HARNESSES.map(h => h.name).join(', ')}`); process.exit(1); }
      return h!;
    });
  } else {
    harnesses = await selectHarnesses(scope, projectDir);
  }

  // --- Determine scope ---
  if (!options.global && !options.yes && !options.to.length) {
    const selectedScope = await selectScope();
    if (selectedScope === 'global') {
      options.global = true;
    }
  }

  const finalScope = options.global ? 'global' : 'project';
  const scopeLabel = options.global ? 'globally' : 'to this project';

  // --- Confirm ---
  if (!options.yes) {
    p.log.info(
      `Will sync ${pc.bold(String(agents.length))} agent(s) to ${pc.bold(String(harnesses.length))} harness(es) ${scopeLabel}:`
    );
    for (const agent of agents) {
      p.log.message(`  ${pc.green('•')} ${pc.bold(agent.name)} ${pc.dim(`(${agent.filename})`)}`);
    }
    p.log.message(`  → ${harnesses.map(h => h.displayName).join(', ')}`);

    const confirmed = await p.confirm({ message: 'Proceed?' });
    if (p.isCancel(confirmed) || !confirmed) {
      p.cancel('Cancelled.');
      process.exit(0);
    }
  }

  // --- Write agent files ---
  for (const harness of harnesses) {
    const dir = harness.agentsDir(finalScope, projectDir);

    for (const agent of agents) {
      const transformed = harness.transformAgent(agent.frontmatter, agent.body);
      const content = serializeAgentFile(transformed.frontmatter, transformed.body);
      const destPath = resolve(dir, agent.filename);

      // Skip if identical
      if (existsSync(destPath)) {
        const existing = readFileSync(destPath, 'utf8');
        if (existing === content) {
          p.log.info(`${harness.displayName}: ${pc.bold(agent.name)} ${pc.dim('(unchanged)')}`);
          continue;
        }
      }

      mkdirSync(dir, { recursive: true });
      writeFileSync(destPath, content, 'utf8');
      p.log.success(`${harness.displayName}: ${pc.bold(agent.name)} ${pc.dim(`(${destPath})`)}`);
    }
  }

  p.outro(`Synced ${agents.length} agent(s) to ${harnesses.length} harness(es). ${pc.green('✓')}`);
}

// ---------------------------------------------------------------------------
// Auto-detect mode
// ---------------------------------------------------------------------------

async function runAutoDetect(mcpOptions: McpCliOptions, agentOptions: AgentCliOptions, projectDir: string): Promise<void> {
  const hasMcp = existsSync(resolve(projectDir, 'mcp.json'));
  const agentsDirPath = resolve(projectDir, 'agents');
  const hasAgents = existsSync(agentsDirPath) && statSync(agentsDirPath).isDirectory();

  if (!hasMcp && !hasAgents) {
    p.cancel(`Nothing to sync. No mcp.json or agents/ directory found in ${projectDir}`);
    process.exit(1);
  }

  if (hasMcp) {
    p.log.info(`Found ${pc.bold('mcp.json')} — syncing MCP servers`);
    await runMcpSync(mcpOptions, projectDir);
  }

  if (hasAgents) {
    if (hasMcp) {
      p.log.info(`Found ${pc.bold('agents/')} — syncing agent definitions`);
    }
    agentOptions.source = agentsDirPath;
    await runAgentSync(agentOptions, projectDir);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { mode, mcpOptions, agentOptions } = parseArgs(process.argv);
  const projectDir = process.cwd();

  p.intro(pc.bold('mcp-sync'));

  if (mode === 'agents') {
    await runAgentSync(agentOptions, projectDir);
  } else if (mode === 'mcp') {
    await runMcpSync(mcpOptions, projectDir);
  } else {
    // auto-detect
    await runAutoDetect(mcpOptions, agentOptions, projectDir);
  }
}

main().catch((err) => {
  p.cancel((err as Error).message ?? String(err));
  process.exit(1);
});
