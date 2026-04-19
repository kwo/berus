# berus

A lightweight CLI framework for TypeScript heavily inspired by Go's [Cobra](https://github.com/spf13/cobra).

`berus` provides an intuitive, tree-based API for building powerful modern CLI applications in Node.js, while adapting idiomatic TypeScript/JavaScript constructs (like Promises for async execution and standard JS ecosystem tooling).

## Quick Start

```typescript
import { Command } from 'berus';

// 1. Create a root command
const rootCmd = new Command({
  use: 'mycli',
  short: 'A fast and flexible CLI tool',
  run: (cmd) => {
    if (cmd.flags().getBoolean('verbose')) {
      console.log('Running in verbose mode');
    } else {
      console.log('Running mycli');
    }
  },
});

// 2. Add flags
rootCmd.flags().boolean('verbose', 'v', false, 'Enable verbose output');

// 3. Create a subcommand
const versionCmd = new Command({
  use: 'version',
  short: 'Print the version number',
  run: () => {
    console.log('mycli v1.0.0');
  },
});

// 4. Attach subcommand to root
rootCmd.addCommand(versionCmd);

// 5. Execute!
void rootCmd.execute();
```

## Features

### Tree-based Command Routing
Build complex applications by nesting commands. Traverse the command tree based on the provided arguments to automatically execute the correct nested subcommand.

### Execution Lifecycle Hooks
Berus shines in its execution lifecycle. You can define multiple asynchronous hooks that run before or after the main execution logic.

Available hooks (executed in this order):
- `persistentPreRun`: Runs before `preRun` and is inherited by all child commands.
- `preRun`: Runs before `run` for this specific command.
- `run`: The main execution function.
- `postRun`: Runs after `run` for this specific command.
- `persistentPostRun`: Runs after `postRun` and is inherited by all child commands.

### Flags & Options
Define typed flags easily. The library parses boolean, string, and string array flags out of the box.

- **Local Flags**: Available only to the command they are defined on.
- **Persistent Flags**: Defined on a parent command but inherited and usable by all child subcommands.
- **Hidden Flags**: Flags that remain functional but are omitted from the auto-generated help output.
- **Required Flags**: Mark a flag as required to have the framework automatically enforce its presence.

### Argument Validation
Validate positional arguments before command execution.
Available validators:
- `NoArgs()`: Ensure no positional arguments are passed.
- `ExactArgs(n)`: Require exactly `n` positional arguments.
- `MinimumNArgs(n)`: Require at least `n` positional arguments.
- `MaximumNArgs(n)`: Accept at most `n` positional arguments.

### Help & Usage Generation
`berus` automatically generates detailed `--help` output based on your command tree.

- `use`, `short`, `long`, and `example` strings enrich the help text.
- Customize the output by overriding `.setHelpFunc()` and `.setUsageFunc()`.

### Command Groups & UX Features
For larger applications with many subcommands, organize them into visual groups in the help output using `addGroup()` and the `groupID` property.

You can also:
- Define `aliases` to provide alternative names for commands.
- Hide commands using the `hidden` property.
- Mark commands as `deprecated`, which automatically prints a warning before execution.
- Suppress automatic error logging and usage printing with `silenceErrors` and `silenceUsage`.

## Development & Testing

This project uses modern Node.js features and tools:
- **TypeScript** via `tsc` for emitting ESM.
- **Testing** via the Node.js built-in test runner (`node:test`).

To run the tests:
```bash
npm run test
```
