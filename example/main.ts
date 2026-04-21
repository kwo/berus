import { Command } from '../src/index.js';

const rootCmd = new Command({
  use: 'app',
  short: 'App is a fast CLI',
  long: 'A longer description of App showing how it works.',
  flagsConfig: {
    verbose: {
      type: 'boolean',
      short: 'v',
      defaultValue: false,
      description: 'Enable verbose output',
    },
  },
  run: (cmd) => {
    console.log('Running app!');
    if (cmd.flags().getBoolean('verbose')) {
      console.log('Verbose mode enabled.');
    }
  },
});

const versionCmd = new Command({
  use: 'version',
  short: 'Print the version number',
  run: () => {
    console.log('App v1.0.0');
  },
});

const echoCmd = new Command({
  use: 'echo [words...]',
  short: 'Echo back the given words',
  run: (_cmd, args) => {
    console.log(args.join(' '));
  },
});

rootCmd.addCommand(versionCmd, echoCmd);

rootCmd.execute().catch(() => {
  // Error already reported by the framework; exit code is set.
});
