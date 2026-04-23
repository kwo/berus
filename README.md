# @kwo1/berus

A lightweight CLI framework for TypeScript inspired by Go's [Cobra](https://github.com/spf13/cobra).

`@kwo1/berus` provides a tree-based command API for building Node.js CLIs, with persistent lifecycle hooks and declarative flags.

## Install

```bash
npm install @kwo1/berus
```

## Quick Start

```ts
import { Command } from '@kwo1/berus';

const rootCmd = new Command({
  use: 'mycli',
  short: 'A fast and flexible CLI tool',
  flagsConfig: {
    verbose: {
      type: 'boolean',
      short: 'v',
      defaultValue: false,
      description: 'Enable verbose output',
    },
  },
  run: (cmd) => {
    if (cmd.flags().getBoolean('verbose')) {
      console.log('Running in verbose mode');
    } else {
      console.log('Running mycli');
    }
  },
});

const versionCmd = new Command({
  use: 'version',
  short: 'Print the version number',
  run: () => {
    console.log('mycli v1.0.0');
  },
});

rootCmd.addCommand(versionCmd);

void rootCmd.execute().catch(() => {
  // execute() rejects on failure; exit code is already set.
});
```

## Features

### Command Tree Routing
Define parent/child commands and route execution by CLI args.

### Execution Lifecycle Hooks
Hooks run in this order:
- `persistentPreRun`
- `run`
- `persistentPostRun`

### RunState (Shared Hook State)
Use `RunState` to pass data through lifecycle hooks during one execution.

### Declarative Flags
Define flags in command config:
- `flagsConfig` (local flags)
- `persistentFlagsConfig` (inherited by descendants)

Supported flag types:
- `string`
- `boolean`
- `integer`
- `booleanCount` (e.g. `-vvv` style verbosity)

### Required Flags
Set `required: true` in flag config to enforce presence before command run.

### Help & Usage Output
`berus` auto-generates usage/help output from command metadata (`use`, `short`) and command tree structure.

### Aliases
Add alternate command names with `aliases`.

## Development

```bash
npm run test
npm run build
```

## Examples

Two runnable examples live in `example/`:

```bash
npm run example -- --help
npm run example -- echo hello world

npm run example:kitchen -- --help
npm run example:kitchen -- server start --port 9000 -v
```

Arguments after `--` are passed through to the example CLI.
