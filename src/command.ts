import { parseArgs, type ParseArgsOptionsConfig } from 'node:util';

/**
 * RunState is passed sequentially to all run hooks within a command execution lifecycle
 * (persistentPreRun, preRun, run, postRun, persistentPostRun).
 *
 * It allows storing and retrieving arbitrary data, facilitating shared state
 * between hooks without requiring global variables or tightly coupled properties.
 */
export class RunState {
  private _state = new Map<string, unknown>();

  set(key: string, value: unknown): void {
    this._state.set(key, value);
  }

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  get<T>(key: string): T | undefined {
    return this._state.get(key) as T | undefined;
  }

  has(key: string): boolean {
    return this._state.has(key);
  }

  delete(key: string): boolean {
    return this._state.delete(key);
  }

  clear(): void {
    this._state.clear();
  }
}

export type RunFunc = (cmd: Command, args: string[], state: RunState) => void | Promise<void>;
export type ArgsFunc = (cmd: Command, args: string[]) => Error | undefined;
type FlagType = 'string' | 'boolean' | 'integer' | 'booleanCount';
type FlagDefault = string | boolean | number;
type FlagValue = string | boolean | number;

interface FlagDef {
  type: FlagType;
  short?: string;
  defaultValue?: FlagDefault;
  description?: string;
  persistent?: boolean;
  required?: boolean;
}

interface CommandGroup {
  id: string;
  title: string;
}

/**
 * Read-only interface for retrieving parsed flag values on a command.
 */
interface FlagAccessor {
  /**
   * Retrieves the parsed value of a string flag.
   * @param name The full name of the flag.
   * @returns The parsed string value, or the default value, or an empty string.
   */
  getString: (name: string) => string;

  /**
   * Retrieves the parsed value of a boolean flag.
   * @param name The full name of the flag.
   * @returns The parsed boolean value, or the default value, or false.
   */
  getBoolean: (name: string) => boolean;

  /**
   * Retrieves the parsed count of a boolean flag.
   * @param name The full name of the flag.
   * @returns The number of times the flag was provided, or the default value, or 0.
   */
  getBooleanCount: (name: string) => number;

  /**
   * Retrieves the parsed value of an integer flag.
   * @param name The full name of the flag.
   * @returns The parsed integer value, or the default value, or 0.
   */
  getInteger: (name: string) => number;
}

interface ParseOption {
  type: 'string' | 'boolean';
  short?: string;
  multiple?: boolean;
}

export interface FlagConfig {
  type: FlagType;
  short?: string;
  defaultValue?: FlagDefault;
  description?: string;
  required?: boolean;
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

  /**
   * Declarative flags available on this specific command.
   */
  flagsConfig?: Record<string, FlagConfig>;

  /**
   * Declarative flags inherited by this command and all of its subcommands.
   */
  persistentFlagsConfig?: Record<string, FlagConfig>;

  private _parent?: Command;
  private _commands: Command[] = [];
  private _groups: CommandGroup[] = [];
  private _flags: Record<string, FlagDef> = {};
  private _flagValues: Record<string, FlagValue> = {};

  constructor(config?: Partial<Command>) {
    Object.assign(this, config);

    if (this.flagsConfig) {
      for (const [name, flagDef] of Object.entries(this.flagsConfig)) {
        this._flags[name] = Command.createFlagDef(
          flagDef.type,
          flagDef.short,
          flagDef.defaultValue,
          flagDef.description,
          false,
        );
        if (flagDef.required) {
          this._flags[name].required = true;
        }
      }
    }

    if (this.persistentFlagsConfig) {
      for (const [name, flagDef] of Object.entries(this.persistentFlagsConfig)) {
        this._flags[name] = Command.createFlagDef(
          flagDef.type,
          flagDef.short,
          flagDef.defaultValue,
          flagDef.description,
          true,
        );
        if (flagDef.required) {
          this._flags[name].required = true;
        }
      }
    }
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
   * Returns a flag accessor used to retrieve parsed flags.
   */
  flags(): FlagAccessor {
    return {
      getString: (name: string): string => {
        const value = this._flagValues[name] ?? this._flags[name]?.defaultValue;
        return typeof value === 'string' ? value : '';
      },
      getBoolean: (name: string): boolean => {
        const value = this._flagValues[name] ?? this._flags[name]?.defaultValue;
        return typeof value === 'boolean' ? value : false;
      },
      getBooleanCount: (name: string): number => {
        const value = this._flagValues[name] ?? this._flags[name]?.defaultValue;
        return typeof value === 'number' ? value : 0;
      },
      getInteger: (name: string): number => {
        const value = this._flagValues[name] ?? this._flags[name]?.defaultValue;
        return typeof value === 'number' ? value : 0;
      },
    };
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

      const state = new RunState();

      await targetCmd.runPersistentPreRun(parsed.positionals, state);

      if (targetCmd.preRun !== undefined) {
        await targetCmd.preRun(targetCmd, parsed.positionals, state);
      }

      await targetCmd.run(targetCmd, parsed.positionals, state);

      if (targetCmd.postRun !== undefined) {
        await targetCmd.postRun(targetCmd, parsed.positionals, state);
      }

      await targetCmd.runPersistentPostRun(parsed.positionals, state);
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
   * Generates and prints the help output for this command.
   * Automatically invoked when the `--help` flag is provided or no `run` function exists.
   */
  help(args: string[] = []) {
    void args;
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
    console.log('Usage:');
    if (this._commands.length > 0) {
      console.log(`  ${this.use} [command]`);
    } else {
      console.log(`  ${this.use}`);
    }
    console.log();

    const visibleCommands = this._commands;
    if (visibleCommands.length > 0) {
      this.printCommandGroups(visibleCommands);
    }

    const activeFlags = this.getInheritedFlags();
    const visibleFlagKeys = Object.keys(activeFlags);

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
    short: string | undefined,
    defaultValue: FlagDefault | undefined,
    description: string | undefined,
    persistent: boolean,
  ): FlagDef {
    const flag: FlagDef = {
      type,
    };

    if (defaultValue !== undefined) {
      flag.defaultValue = defaultValue;
    }

    if (description !== undefined) {
      flag.description = description;
    }

    if (short !== undefined && short !== '') {
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
      const isBoolean = flag.type === 'boolean' || flag.type === 'booleanCount';
      const isMultiple = flag.type === 'booleanCount';

      const option: ParseOption = {
        type: isBoolean ? 'boolean' : 'string',
      };

      if (flag.short !== undefined) {
        option.short = flag.short;
      }

      if (isMultiple) {
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

      const parsedValue = Command.parseFlagValue(key, flag, rawValue);
      if (parsedValue !== undefined) {
        normalized[key] = parsedValue;
      }
    }

    return normalized;
  }

  private static parseFlagValue(
    flagName: string,
    flag: FlagDef,
    rawValue: unknown,
  ): FlagValue | undefined {
    if (flag.type === 'string') {
      return typeof rawValue === 'string' ? rawValue : undefined;
    }

    if (flag.type === 'integer') {
      if (typeof rawValue !== 'string') {
        return undefined;
      }

      const parsed = Command.parseInteger(rawValue);
      if (parsed === undefined) {
        throw new Error(`invalid integer value "${rawValue}" for flag "${flagName}"`);
      }

      return parsed;
    }

    if (flag.type === 'boolean') {
      return typeof rawValue === 'boolean' ? rawValue : undefined;
    }

    if (Array.isArray(rawValue)) {
      if (flag.type === 'booleanCount') {
        return rawValue.filter((entry): entry is boolean => typeof entry === 'boolean' && entry)
          .length;
      }
    }

    if (typeof rawValue === 'boolean' && flag.type === 'booleanCount') {
      return rawValue ? 1 : 0;
    }

    return undefined;
  }

  private static parseInteger(rawValue: string): number | undefined {
    const trimmed = rawValue.trim();
    if (!/^[+-]?\d+$/.test(trimmed)) {
      return undefined;
    }

    const parsed = Number.parseInt(trimmed, 10);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
  }

  private async runPersistentPreRun(positionals: string[], state: RunState) {
    await Command.runClosestPersistentPreRun(this, this, positionals, state);
  }

  private async runPersistentPostRun(positionals: string[], state: RunState) {
    await Command.runClosestPersistentPostRun(this, this, positionals, state);
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
    state: RunState,
  ) {
    if (current === undefined) {
      return;
    }

    if (current.persistentPreRun !== undefined) {
      await current.persistentPreRun(target, positionals, state);
      return;
    }

    await Command.runClosestPersistentPreRun(current._parent, target, positionals, state);
  }

  private static async runClosestPersistentPostRun(
    current: Command | undefined,
    target: Command,
    positionals: string[],
    state: RunState,
  ) {
    if (current === undefined) {
      return;
    }

    if (current.persistentPostRun !== undefined) {
      await current.persistentPostRun(target, positionals, state);
      return;
    }

    await Command.runClosestPersistentPostRun(current._parent, target, positionals, state);
  }
}
