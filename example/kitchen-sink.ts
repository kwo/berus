import { Command } from '../src/index.js';

// --- ROOT COMMAND ---
const rootCmd = new Command({
  use: 'mycli',
  short: 'A comprehensive CLI tool',
  persistentFlagsConfig: {
    config: {
      type: 'string',
      short: 'c',
      defaultValue: 'config.json',
      description: 'Path to config file',
    },
    verbose: {
      type: 'booleanCount',
      short: 'v',
      defaultValue: 0,
      description: 'Enable verbose logging (-v, -vv, -vvv)',
    },
  },
  persistentPreRun: () => {
    console.log('[Hook] rootCmd persistentPreRun: Setting up global context...');
  },
  persistentPostRun: () => {
    console.log('[Hook] rootCmd persistentPostRun: Cleaning up global context...');
  },
});

// --- SERVER SUBCOMMAND (Level 1) ---
const serverCmd = new Command({
  use: 'server',
  aliases: ['srv', 'daemon'],
  short: 'Manage the application server',
  run: ({ cmd }) => {
    cmd.help();
  },
});

// -- Server Start (Level 2) --
const startCmd = new Command({
  use: 'start',
  short: 'Start the server',
  flagsConfig: {
    port: {
      type: 'integer',
      short: 'p',
      defaultValue: 8080,
      description: 'Port to listen on',
    },
  },
  run: ({ cmd }) => {
    const port = cmd.flags().getInteger('port');
    const verbosity = cmd.flags().getBooleanCount('verbose');
    console.log(`Starting server on port ${String(port)} (verbosity: ${String(verbosity)})`);
  },
});

// -- Server DB (Level 2) --
const dbCmd = new Command({
  use: 'db',
  short: 'Database operations for the server',
});

// -- Server DB Config (Level 3) --
const dbConfigCmd = new Command({
  use: 'config',
  short: 'Configure database settings',
});

// -- Server DB Config Get (Level 4) --
const dbConfigGetCmd = new Command({
  use: 'get [key]',
  short: 'Get a specific database configuration value',
  run: ({ cmd, args }) => {
    if (args.length !== 1) {
      throw new Error(`accepts 1 arg(s), received ${String(args.length)}`);
    }
    const key = args[0] ?? '';
    const configPath = cmd.flags().getString('config');
    console.log(`Reading DB config key "${key}" using config file: ${configPath}`);
  },
});

dbConfigCmd.addCommand(dbConfigGetCmd);
dbCmd.addCommand(dbConfigCmd);
serverCmd.addCommand(startCmd, dbCmd);

// --- ADMIN COMMANDS (Level 1) ---
const adminCmd = new Command({
  use: 'admin [action] [users...]',
  short: 'Run administrative tasks',
  flagsConfig: {
    force: {
      type: 'boolean',
      short: 'f',
      defaultValue: false,
      description: 'Force the administrative action',
    },
  },
  run: ({ cmd, args }) => {
    if (args.length < 1) {
      throw new Error(`requires at least 1 arg(s), only received ${String(args.length)}`);
    }
    const action = args[0];
    const targetUsers = args.slice(1);
    const force = cmd.flags().getBoolean('force');
    console.log(`Admin action: ${String(action)}`);
    console.log(`Target users: ${targetUsers.join(', ')}`);
    if (force) {
      console.log('Force mode is ENABLED.');
    }
  },
});

rootCmd.addCommand(serverCmd, adminCmd);

// --- EXECUTE ---
rootCmd.execute().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
