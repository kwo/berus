import { Command } from '../src/index.js';

const rootCmd = new Command({
  use: 'app',
  short: 'App is a fast CLI',
  flagsConfig: {
    verbose: {
      type: 'boolean',
      short: 'v',
      defaultValue: false,
      description: 'Enable verbose output',
    },
  },
  run: ({ cmd }) => {
    console.log('Running app!');
    if (cmd.flags().getBoolean('verbose')) {
      console.log('Verbose mode enabled.');
    }
  },
});

const versionCmd = new Command({
  use: 'version',
  aliases: ['ver', 'v'],
  short: 'Print the version number',
  run: () => {
    console.log('App v1.0.0');
  },
});

const echoCmd = new Command({
  use: 'echo [words...]',
  short: 'Echo back the given words',
  aliases: ['e'],
  run: ({ args }) => {
    console.log(args.join(' '));
  },
});

rootCmd.addCommand(versionCmd, echoCmd);

rootCmd.execute().catch(() => {
  // Error already reported by the framework; exit code is set.
});
