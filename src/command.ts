import { parseArgs, type ParseArgsOptionsConfig } from 'node:util';

export type RunFunc = (cmd: Command, args: string[]) => void | Promise<void>;
export type ArgsFunc = (cmd: Command, args: string[]) => Error | undefined;
type FlagType = 'string' | 'boolean' | 'stringArray';
type FlagDefault = string | boolean | string[];
type FlagValue = string | boolean | string[];

interface FlagDef {
  type: FlagType;
  short?: string;
  defaultValue?: FlagDefault;
  description?: string;
  persistent?: boolean;
  required?: boolean;
  hidden?: boolean;
}

interface CommandGroup {
  id: string;
  title: string;
}

interface FlagAccessor {
  string: (name: string, short: string, defaultValue: string, description: string) => void;
  boolean: (name: string, short: string, defaultValue: boolean, description: string) => void;
  stringArray: (name: string, short: string, defaultValue: string[], description: string) => void;
  getString: (name: string) => string;
  getBoolean: (name: string) => boolean;
  getStringArray: (name: string) => string[];
}

interface PersistentFlagAccessor {
  string: (name: string, short: string, defaultValue: string, description: string) => void;
  boolean: (name: string, short: string, defaultValue: boolean, description: string) => void;
  stringArray: (name: string, short: string, defaultValue: string[], description: string) => void;
}

interface ParseOption {
  type: 'string' | 'boolean';
  short?: string;
  multiple?: boolean;
}

export class Command {
  /**
   * The one-line usage message.
   * Typically starts with the command name, followed by expected arguments.
   * Example: "echo [words...]"
   */
  use = '';

  /**
   * A short description shown in the 'help' output of the parent command.
   */
  short = '';

  /**
   * A long description shown in the specific 'help' output for this command.
   */
  long = '';

  /**
   * Example usage string, shown in the specific 'help' output.
   */
  example = '';

  /**
   * Alternative names that can be used to invoke this command.
   */
  aliases: string[] = [];

  /**
   * The ID of the group this command belongs to.
   * Used to organize commands in the parent's help output.
   */
  groupID = '';

  /**
   * If true, this command will not be shown in the help output.
   */
  hidden = false;

  /**
   * If set to a string, using this command will print a deprecation warning
   * with the provided string as the message.
   */
  deprecated = '';

  /**
   * If true, errors will not be printed automatically when execution fails.
   */
  silenceErrors = false;

  /**
   * If true, the usage message will not be printed automatically when an error occurs.
   */
  silenceUsage = false;

  /**
   * Function used to validate the positional arguments.
   * Example: `ExactArgs(2)`
   */
  args?: ArgsFunc;

  /**
   * The primary execution function for the command.
   */
  run?: RunFunc;

  /**
   * A pre-run execution function that is inherited by all child commands.
   * It runs before `preRun` and `run`.
   */
  persistentPreRun?: RunFunc;

  /**
   * A pre-run execution function for this specific command.
   * It runs after `persistentPreRun` but before `run`.
   */
  preRun?: RunFunc;

  /**
   * A post-run execution function for this specific command.
   * It runs after `run`.
   */
  postRun?: RunFunc;

  /**
   * A post-run execution function that is inherited by all child commands.
   * It runs after `postRun`.
   */
  persistentPostRun?: RunFunc;

  private _parent?: Command;
  private _commands: Command[] = [];
  private _groups: CommandGroup[] = [];
  private _flags: Record<string, FlagDef> = {};
  private _flagValues: Record<string, FlagValue> = {};
  private _helpFunc?: (cmd: Command, args: string[]) => void;
  private _usageFunc?: (cmd: Command) => void;

  constructor(config?: Partial<Command>) {
    Object.assign(this, config);
  }

  /**
   * Adds one or more child commands to this command.
   * establishing the parent-child relationship necessary for routing
   * and persistent flag inheritance.
   *
   * @param cmds One or more Command instances to add as subcommands.
   */
  addCommand(...cmds: Command[]) {
    for (const cmd of cmds) {
      cmd._parent = this;
      this._commands.push(cmd);
    }
  }

  /**
   * Defines a new command group. Subcommands can reference this groupID
   * to be organized under this title in the help output.
   *
   * @param id The unique identifier for the group.
   * @param title The display title shown in the help output.
   */
  addGroup(id: string, title: string) {
    this._groups.push({ id, title });
  }

  /**
   * Returns a flag accessor used to define and retrieve local flags.
   * Local flags are only available on this specific command.
   */
  flags(): FlagAccessor {
    return {
      string: (name: string, short: string, defaultValue: string, description: string) => {
        this._flags[name] = Command.createFlagDef(
          'string',
          short,
          defaultValue,
          description,
          false,
        );
      },
      boolean: (name: string, short: string, defaultValue: boolean, description: string) => {
        this._flags[name] = Command.createFlagDef(
          'boolean',
          short,
          defaultValue,
          description,
          false,
        );
      },
      stringArray: (name: string, short: string, defaultValue: string[], description: string) => {
        this._flags[name] = Command.createFlagDef(
          'stringArray',
          short,
          defaultValue,
          description,
          false,
        );
      },
      getString: (name: string): string => {
        const value = this._flagValues[name] ?? this._flags[name]?.defaultValue;
        return typeof value === 'string' ? value : '';
      },
      getBoolean: (name: string): boolean => {
        const value = this._flagValues[name] ?? this._flags[name]?.defaultValue;
        return typeof value === 'boolean' ? value : false;
      },
      getStringArray: (name: string): string[] => {
        const value = this._flagValues[name] ?? this._flags[name]?.defaultValue;
        return Array.isArray(value)
          ? value.filter((item): item is string => typeof item === 'string')
          : [];
      },
    };
  }

  /**
   * Returns a flag accessor used to define persistent flags.
   * Persistent flags are available on this command and all of its subcommands.
   */
  persistentFlags(): PersistentFlagAccessor {
    return {
      string: (name: string, short: string, defaultValue: string, description: string) => {
        this._flags[name] = Command.createFlagDef('string', short, defaultValue, description, true);
      },
      boolean: (name: string, short: string, defaultValue: boolean, description: string) => {
        this._flags[name] = Command.createFlagDef(
          'boolean',
          short,
          defaultValue,
          description,
          true,
        );
      },
      stringArray: (name: string, short: string, defaultValue: string[], description: string) => {
        this._flags[name] = Command.createFlagDef(
          'stringArray',
          short,
          defaultValue,
          description,
          true,
        );
      },
    };
  }

  /**
   * Marks a previously defined flag as required.
   * If the user fails to provide this flag, execution will halt with an error.
   *
   * @param name The name of the flag to mark as required.
   */
  markFlagRequired(name: string) {
    const flag = this._flags[name];
    if (flag !== undefined) {
      flag.required = true;
    }
  }

  /**
   * Marks a previously defined flag as hidden.
   * The flag will still function if provided, but it will not appear in the help output.
   *
   * @param name The name of the flag to hide.
   */
  markFlagHidden(name: string) {
    const flag = this._flags[name];
    if (flag !== undefined) {
      flag.hidden = true;
    }
  }

  /**
   * Gathers all flags applicable to this command, including local flags
   * and any persistent flags inherited from ancestor commands.
   * Local flags shadow inherited persistent flags of the same name.
   */
  getInheritedFlags(): Record<string, FlagDef> {
    const flags: Record<string, FlagDef> = { ...this._flags };
    let current = this._parent;

    while (current !== undefined) {
      for (const [key, def] of Object.entries(current._flags)) {
        if (def.persistent === true && flags[key] === undefined) {
          flags[key] = def;
        }
      }
      current = current._parent;
    }

    return flags;
  }

  /**
   * The primary entry point for executing the CLI.
   * It handles routing the arguments to the correct subcommand, parsing flags,
   * validating arguments, and running the command lifecycle hooks.
   *
   * @param args The raw command line arguments. Defaults to `process.argv.slice(2)`.
   */
  async execute(args: string[] = process.argv.slice(2)) {
    const [targetCmd, remainingArgs] = this.findTarget(args);
    const activeFlags = targetCmd.getInheritedFlags();

    activeFlags.help ??= {
      type: 'boolean',
      short: 'h',
      description: `help for ${targetCmd.name()}`,
    };

    try {
      const parseOptions = Command.buildParseOptions(activeFlags);
      const parsed = parseArgs({
        args: remainingArgs,
        options: parseOptions as ParseArgsOptionsConfig,
        strict: true,
        allowPositionals: true,
      });

      const rawValues: Record<string, unknown> = parsed.values;
      targetCmd._flagValues = Command.normalizeParsedValues(activeFlags, rawValues);

      if (targetCmd._flagValues.help === true) {
        targetCmd.help(remainingArgs);
        return;
      }

      if (targetCmd.deprecated !== '') {
        console.warn(`Command "${targetCmd.name()}" is deprecated, ${targetCmd.deprecated}`);
      }

      for (const [key, def] of Object.entries(activeFlags)) {
        if (def.required === true && rawValues[key] === undefined) {
          throw new Error(`required flag(s) "${key}" not set`);
        }
      }

      if (targetCmd.args !== undefined) {
        const err = targetCmd.args(targetCmd, parsed.positionals);
        if (err !== undefined) {
          throw err;
        }
      }

      if (targetCmd.run === undefined) {
        targetCmd.help(remainingArgs);
        return;
      }

      await targetCmd.runPersistentPreRun(parsed.positionals);

      if (targetCmd.preRun !== undefined) {
        await targetCmd.preRun(targetCmd, parsed.positionals);
      }

      await targetCmd.run(targetCmd, parsed.positionals);

      if (targetCmd.postRun !== undefined) {
        await targetCmd.postRun(targetCmd, parsed.positionals);
      }

      await targetCmd.runPersistentPostRun(parsed.positionals);
    } catch (error: unknown) {
      if (!targetCmd.silenceErrors) {
        console.error(`Error: ${Command.errorMessage(error)}`);
      }
      if (!targetCmd.silenceUsage) {
        targetCmd.usage();
      }
      process.exitCode = 1;
    }
  }

  /**
   * Retrieves all child commands added to this command.
   */
  commands(): Command[] {
    return this._commands;
  }

  /**
   * Recursively traverses upwards to find the top-most (root) command in the tree.
   */
  root(): Command {
    if (this._parent === undefined) {
      return this;
    }
    return this._parent.root();
  }

  /**
   * Traverses the command tree based on the provided arguments to find the target subcommand.
   * Stops traversing when an argument doesn't match a subcommand or is a flag.
   *
   * @param args The arguments to route.
   * @returns A tuple containing the target Command and the remaining un-routed arguments.
   */
  findTarget(args: string[]): [Command, string[]] {
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === undefined) {
        continue;
      }

      // Skip flags (and their values if we were doing a full parse,
      // but simple traversal just skips words starting with '-')
      if (arg.startsWith('-')) {
        continue;
      }

      // Try to find a subcommand matching this argument
      const subCmd = this._commands.find(
        (command) => command.name() === arg || command.aliases.includes(arg),
      );

      if (subCmd !== undefined) {
        // Remove the matched subcommand from the arguments
        const nextArgs = [...args.slice(0, i), ...args.slice(i + 1)];
        return subCmd.findTarget(nextArgs);
      } else {
        // If it doesn't match a subcommand and doesn't start with '-',
        // it must be a positional argument for the CURRENT command.
        // We stop traversing here so it gets passed as a positional.
        break;
      }
    }

    return [this, args];
  }

  /**
   * Evaluates the `use` property to extract just the command name.
   */
  name(): string {
    const [commandName = ''] = this.use.split(' ');
    return commandName;
  }

  /**
   * Overrides the default help function for this command and its children.
   */
  setHelpFunc(func: (cmd: Command, args: string[]) => void) {
    this._helpFunc = func;
  }

  /**
   * Overrides the default usage function for this command and its children.
   */
  setUsageFunc(func: (cmd: Command) => void) {
    this._usageFunc = func;
  }

  /**
   * Generates and prints the help output for this command.
   * Automatically invoked when the `--help` flag is provided or no `run` function exists.
   */
  help(args: string[] = []) {
    const helpFunc = this.findHelpFunc();
    if (helpFunc !== undefined) {
      helpFunc(this, args);
      return;
    }

    console.log();

    const description = this.long !== '' ? this.long : this.short;
    if (description !== '') {
      console.log(description);
      console.log();
    }

    this.usage();
  }

  /**
   * Generates and prints the usage summary, listing subcommands and flags.
   * Called automatically by `help()` or when a command fails (unless `silenceUsage` is true).
   */
  usage() {
    const usageFunc = this.findUsageFunc();
    if (usageFunc !== undefined) {
      usageFunc(this);
      return;
    }

    console.log('Usage:');
    if (this._commands.length > 0) {
      console.log(`  ${this.use} [command]`);
    } else {
      console.log(`  ${this.use}`);
    }
    console.log();

    const visibleCommands = this._commands.filter((command) => !command.hidden);
    if (visibleCommands.length > 0) {
      this.printCommandGroups(visibleCommands);
    }

    const activeFlags = this.getInheritedFlags();
    const visibleFlagKeys = Object.keys(activeFlags).filter(
      (key) => activeFlags[key]?.hidden !== true,
    );

    if (visibleFlagKeys.length > 0) {
      console.log('Flags:');
      for (const key of visibleFlagKeys) {
        const flag = activeFlags[key];
        if (flag === undefined) {
          continue;
        }

        const shortPrefix = flag.short !== undefined ? `-${flag.short}, ` : '    ';
        const defaultSuffix = Command.formatDefaultSuffix(flag.defaultValue);
        const requiredSuffix = flag.required === true ? ' (required)' : '';
        const description = flag.description ?? '';

        console.log(
          `  ${shortPrefix}--${key.padEnd(10)} ${description}${defaultSuffix}${requiredSuffix}`,
        );
      }
      console.log();
    }
  }

  private static createFlagDef(
    type: FlagType,
    short: string,
    defaultValue: FlagDefault,
    description: string,
    persistent: boolean,
  ): FlagDef {
    const flag: FlagDef = {
      type,
      defaultValue,
      description,
    };

    if (short !== '') {
      flag.short = short;
    }

    if (persistent) {
      flag.persistent = true;
    }

    return flag;
  }

  private static buildParseOptions(flags: Record<string, FlagDef>): Record<string, ParseOption> {
    const parseOptions: Record<string, ParseOption> = {};

    for (const [key, flag] of Object.entries(flags)) {
      const option: ParseOption = {
        type: flag.type === 'stringArray' ? 'string' : flag.type,
      };

      if (flag.short !== undefined) {
        option.short = flag.short;
      }

      if (flag.type === 'stringArray') {
        option.multiple = true;
      }

      parseOptions[key] = option;
    }

    return parseOptions;
  }

  private static normalizeParsedValues(
    flags: Record<string, FlagDef>,
    rawValues: Record<string, unknown>,
  ): Record<string, FlagValue> {
    const normalized: Record<string, FlagValue> = {};

    for (const [key, flag] of Object.entries(flags)) {
      const rawValue = rawValues[key];
      if (rawValue === undefined) {
        continue;
      }

      const parsedValue = Command.parseFlagValue(flag, rawValue);
      if (parsedValue !== undefined) {
        normalized[key] = parsedValue;
      }
    }

    return normalized;
  }

  private static parseFlagValue(flag: FlagDef, rawValue: unknown): FlagValue | undefined {
    if (flag.type === 'string') {
      return typeof rawValue === 'string' ? rawValue : undefined;
    }

    if (flag.type === 'boolean') {
      return typeof rawValue === 'boolean' ? rawValue : undefined;
    }

    if (Array.isArray(rawValue)) {
      return rawValue.filter((entry): entry is string => typeof entry === 'string');
    }

    if (typeof rawValue === 'string') {
      return [rawValue];
    }

    return undefined;
  }

  private async runPersistentPreRun(positionals: string[]) {
    await Command.runClosestPersistentPreRun(this, this, positionals);
  }

  private async runPersistentPostRun(positionals: string[]) {
    await Command.runClosestPersistentPostRun(this, this, positionals);
  }

  private findHelpFunc(): ((cmd: Command, args: string[]) => void) | undefined {
    if (this._helpFunc !== undefined) {
      return this._helpFunc;
    }

    let current = this._parent;
    while (current !== undefined) {
      if (current._helpFunc !== undefined) {
        return current._helpFunc;
      }
      current = current._parent;
    }

    return undefined;
  }

  private findUsageFunc(): ((cmd: Command) => void) | undefined {
    if (this._usageFunc !== undefined) {
      return this._usageFunc;
    }

    let current = this._parent;
    while (current !== undefined) {
      if (current._usageFunc !== undefined) {
        return current._usageFunc;
      }
      current = current._parent;
    }

    return undefined;
  }

  private printCommandGroups(visibleCommands: Command[]) {
    const grouped = new Map<string, Command[]>();
    const ungrouped: Command[] = [];

    for (const command of visibleCommands) {
      if (command.groupID === '') {
        ungrouped.push(command);
        continue;
      }

      const existing = grouped.get(command.groupID);
      if (existing === undefined) {
        grouped.set(command.groupID, [command]);
      } else {
        existing.push(command);
      }
    }

    if (this._groups.length > 0) {
      for (const group of this._groups) {
        const commands = grouped.get(group.id);
        if (commands === undefined || commands.length === 0) {
          continue;
        }

        console.log(`${group.title}:`);
        for (const command of commands) {
          console.log(`  ${command.name().padEnd(15)} ${command.short}`);
        }
        console.log();
      }
    }

    if (ungrouped.length > 0) {
      console.log(this._groups.length > 0 ? 'Other Commands:' : 'Available Commands:');
      for (const command of ungrouped) {
        console.log(`  ${command.name().padEnd(15)} ${command.short}`);
      }
      console.log();
    }
  }

  private static formatDefaultSuffix(defaultValue: FlagDefault | undefined): string {
    if (defaultValue === undefined || defaultValue === '' || defaultValue === false) {
      return '';
    }

    if (Array.isArray(defaultValue) && defaultValue.length === 0) {
      return '';
    }

    return ` (default ${JSON.stringify(defaultValue)})`;
  }

  private static errorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }

  private static async runClosestPersistentPreRun(
    current: Command | undefined,
    target: Command,
    positionals: string[],
  ) {
    if (current === undefined) {
      return;
    }

    if (current.persistentPreRun !== undefined) {
      await current.persistentPreRun(target, positionals);
      return;
    }

    await Command.runClosestPersistentPreRun(current._parent, target, positionals);
  }

  private static async runClosestPersistentPostRun(
    current: Command | undefined,
    target: Command,
    positionals: string[],
  ) {
    if (current === undefined) {
      return;
    }

    if (current.persistentPostRun !== undefined) {
      await current.persistentPostRun(target, positionals);
      return;
    }

    await Command.runClosestPersistentPostRun(current._parent, target, positionals);
  }
}
