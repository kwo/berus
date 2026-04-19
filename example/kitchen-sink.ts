import { Command, ExactArgs, MinimumNArgs } from '../src/index.js';

// --- ROOT COMMAND ---
const rootCmd = new Command({
  use: 'mycli',
  short: 'A comprehensive CLI tool',
  long: 'MyCLI demonstrates all the advanced features of the berus library.',
  example: '  mycli server start --port 8080\n  mycli config get database.url',
  silenceErrors: true, // We will handle errors gracefully if we want, or rely on the framework
  persistentPreRun: () => {
    console.log('[Hook] rootCmd persistentPreRun: Setting up global context...');
  },
  persistentPostRun: () => {
    console.log('[Hook] rootCmd persistentPostRun: Cleaning up global context...');
  },
});

// Global persistent flags available on all subcommands
rootCmd.persistentFlags().string('config', 'c', 'config.json', 'Path to config file');
rootCmd.persistentFlags().boolean('verbose', 'v', false, 'Enable verbose logging');

// Group definitions for help output
rootCmd.addGroup('server', 'Server Operations');
rootCmd.addGroup('admin', 'Administrative Commands');

// --- SERVER SUBCOMMAND (Level 1) ---
const serverCmd = new Command({
  use: 'server',
  aliases: ['srv', 'daemon'],
  short: 'Manage the application server',
  groupID: 'server',
  run: () => {
    console.log('Use a subcommand: start, stop, or db');
  },
});

// -- Server Start (Level 2) --
const startCmd = new Command({
  use: 'start',
  short: 'Start the server',
  preRun: () => {
    console.log('[Hook] startCmd preRun: Preparing server resources...');
  },
  run: (cmd) => {
    const port = cmd.flags().getString('port');
    const verbose = cmd.flags().getBoolean('verbose'); // Access persistent flag
    console.log(`Starting server on port ${port} (verbose: ${String(verbose)})`);
  },
});
startCmd.flags().string('port', 'p', '8080', 'Port to listen on');

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
  args: ExactArgs(1),
  run: (cmd, args) => {
    const key = args[0] ?? '';
    const configPath = cmd.getInheritedFlags().config?.defaultValue; // Access persistent flag
    console.log(`Reading DB config key "${key}" using config file: ${String(configPath)}`);
  },
});

// Assemble the nested server tree: root -> server -> db -> config -> get
dbConfigCmd.addCommand(dbConfigGetCmd);
dbCmd.addCommand(dbConfigCmd);
serverCmd.addCommand(startCmd, dbCmd);

// --- ADMIN COMMANDS (Level 1) ---
const adminCmd = new Command({
  use: 'admin [action] [users...]',
  short: 'Run administrative tasks',
  groupID: 'admin',
  args: MinimumNArgs(1),
  run: (cmd, args) => {
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
adminCmd.flags().boolean('force', 'f', false, 'Force the administrative action');

// --- HIDDEN & DEPRECATED COMMANDS ---
const legacyCmd = new Command({
  use: 'legacy-sync',
  short: 'Old sync method',
  deprecated: 'use "admin sync" instead.',
  run: () => {
    console.log('Running legacy sync...');
  },
});

const secretDevCmd = new Command({
  use: 'dev-debug',
  short: 'Internal debug tool',
  hidden: true,
  run: () => {
    console.log('Secret developer debug info printed here.');
  },
});

// Assemble root children
rootCmd.addCommand(serverCmd, adminCmd, legacyCmd, secretDevCmd);

// --- EXECUTE ---
// Wrapped in async IIFE since execute() is async
void (async () => {
  await rootCmd.execute();
})();
