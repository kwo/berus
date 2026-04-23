import { parseArgs, type ParseArgsOptionsConfig } from 'node:util';

/**
 * RunState is passed sequentially to all run hooks within a command execution lifecycle
 * (persistentPreRun, run, persistentPostRun).
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

export interface RunContext {
  cmd: Command;
  args: string[];
  state: RunState;
}

export type RunFunc = (ctx: RunContext) => void | Promise<void>;
type FlagType = 'string' | 'boolean' | 'integer' | 'booleanCount';
type FlagValue = string | boolean | number;

export interface FlagConfig {
  type: FlagType;
  short?: string;
  defaultValue?: FlagValue;
  description?: string;
  required?: boolean;
}

interface FlagDef extends FlagConfig {
  persistent?: boolean;
}

/**
 * Read-only interface for retrieving parsed flag values on a command.
 */
interface FlagAccessor {
  /** Retrieves the parsed value of a string flag. */
  getString: (name: string) => string;
  /** Retrieves the parsed value of a boolean flag. */
  getBoolean: (name: string) => boolean;
  /** Retrieves the parsed count of a boolean flag. */
  getBooleanCount: (name: string) => number;
  /** Retrieves the parsed value of an integer flag. */
  getInteger: (name: string) => number;
}

export interface CommandConfig {
  use?: string;
  short?: string;
  aliases?: string[];
  run?: RunFunc;
  persistentPreRun?: RunFunc;
  persistentPostRun?: RunFunc;
  flagsConfig?: Record<string, FlagConfig>;
  persistentFlagsConfig?: Record<string, FlagConfig>;
}

export class Command {
  /** The one-line usage message (e.g. "echo [words...]"). */
  use = '';
  /** A short description shown in the parent command's help output. */
  short = '';
  /** Alternative names that can be used to invoke this command. */
  aliases: string[] = [];
  /** Primary execution function. */
  run?: RunFunc;
  /** Pre-run hook inherited by descendants. Runs before `run`. */
  persistentPreRun?: RunFunc;
  /** Post-run hook inherited by descendants. Runs after `run`. */
  persistentPostRun?: RunFunc;
  /** Declarative flags local to this command. */
  flagsConfig?: Record<string, FlagConfig>;
  /** Declarative flags inherited by this command and its subcommands. */
  persistentFlagsConfig?: Record<string, FlagConfig>;

  private _parent?: Command;
  private _commands: Command[] = [];
  private _flags: Record<string, FlagDef> = {};
  private _flagValues: Record<string, FlagValue> = {};

  constructor(config?: CommandConfig) {
    Object.assign(this, config);
    this.refreshFlags();
  }

  /**
   * Rebuilds this command's internal flag registry from `flagsConfig` and
   * `persistentFlagsConfig`. Call this after mutating either config object
   * at runtime (for example, from plugins that register flags on the root
   * command after construction).
   */
  refreshFlags() {
    this._flags = {};
    for (const [name, def] of Object.entries(this.flagsConfig ?? {})) {
      this._flags[name] = { ...def };
    }
    for (const [name, def] of Object.entries(this.persistentFlagsConfig ?? {})) {
      this._flags[name] = { ...def, persistent: true };
    }
  }

  /**
   * Adds one or more child commands, establishing the parent-child relationship
   * necessary for routing and persistent flag inheritance.
   */
  addCommand(...cmds: Command[]) {
    for (const cmd of cmds) {
      cmd._parent = this;
      this._commands.push(cmd);
    }
  }

  /** Returns a flag accessor used to retrieve parsed flag values. */
  flags(): FlagAccessor {
    const read = (name: string): FlagValue | undefined => {
      const owner = this.flagOwner(name) ?? this;
      return owner._flagValues[name] ?? owner._flags[name]?.defaultValue;
    };
    return {
      getString: (name) => {
        const v = read(name);
        return typeof v === 'string' ? v : '';
      },
      getBoolean: (name) => {
        const v = read(name);
        return typeof v === 'boolean' ? v : false;
      },
      getBooleanCount: (name) => {
        const v = read(name);
        return typeof v === 'number' ? v : 0;
      },
      getInteger: (name) => {
        const v = read(name);
        return typeof v === 'number' ? v : 0;
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
    for (let current = this._parent; current !== undefined; current = current._parent) {
      for (const [key, def] of Object.entries(current._flags)) {
        if (def.persistent === true && flags[key] === undefined) {
          flags[key] = def;
        }
      }
    }
    return flags;
  }

  /**
   * Locates the command that declares the given flag. Returns this command when
   * the flag is local, an ancestor when the flag is inherited via persistence,
   * or undefined when the flag is not declared anywhere in the chain.
   */
  private flagOwner(name: string): Command | undefined {
    if (this._flags[name] !== undefined) {
      return this;
    }
    for (let current = this._parent; current !== undefined; current = current._parent) {
      const def = current._flags[name];
      if (def?.persistent === true) {
        return current;
      }
    }
    return undefined;
  }

  /**
   * Primary entry point for executing the CLI. Routes arguments to the target
   * subcommand, parses flags, and runs lifecycle hooks.
   */
  async execute(args: string[] = process.argv.slice(2)) {
    const [targetCmd, remainingArgs] = this.findTarget(args);
    const activeFlags: Record<string, FlagDef> = {
      ...targetCmd.getInheritedFlags(),
    };
    activeFlags.help ??= {
      type: 'boolean',
      short: 'h',
      description: `help for ${targetCmd.name()}`,
    };

    try {
      const parsed = parseArgs({
        args: remainingArgs,
        options: Command.buildParseOptions(activeFlags),
        strict: true,
        allowPositionals: true,
      });

      const rawValues: Record<string, unknown> = parsed.values;
      const normalized = Command.normalizeParsedValues(activeFlags, rawValues);
      targetCmd._flagValues = {};
      for (const [name, value] of Object.entries(normalized)) {
        const owner = targetCmd.flagOwner(name) ?? targetCmd;
        owner._flagValues[name] = value;
      }

      if (targetCmd.flags().getBoolean('help')) {
        targetCmd.help();
        return;
      }

      for (const [key, def] of Object.entries(activeFlags)) {
        if (def.required === true && rawValues[key] === undefined) {
          throw new Error(`required flag(s) "${key}" not set`);
        }
      }

      const state = new RunState();
      const runCtx: RunContext = { cmd: targetCmd, args: parsed.positionals, state };

      if (targetCmd.run === undefined) {
        targetCmd.help();
        return;
      }

      const persistentPreRun = Command.findInheritedHook(targetCmd, 'persistentPreRun');
      if (persistentPreRun !== undefined) {
        await persistentPreRun(runCtx);
      }

      await targetCmd.run(runCtx);

      const persistentPostRun = Command.findInheritedHook(targetCmd, 'persistentPostRun');
      if (persistentPostRun !== undefined) {
        await persistentPostRun(runCtx);
      }
    } catch (error: unknown) {
      console.error(`Error: ${Command.errorMessage(error)}`);
      console.error(`Run '${targetCmd.name()} --help' for usage.`);
      process.exitCode = 1;
      throw error;
    }
  }

  /**
   * Traverses the command tree based on the provided arguments to find the target subcommand.
   * Stops traversing when an argument doesn't match a subcommand or is a flag.
   *
   * @returns A tuple containing the target Command and the remaining un-routed arguments.
   */
  findTarget(args: string[]): [Command, string[]] {
    const flags = this.getInheritedFlags();
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === undefined) {
        continue;
      }
      if (arg === '--') {
        break;
      }
      if (arg.startsWith('-')) {
        // For `--flag value` / `-f value` forms, also skip the value token so it
        // isn't misread as a positional subcommand name.
        if (!arg.includes('=')) {
          const name = arg.startsWith('--') ? arg.slice(2) : arg.slice(1);
          const def = flags[name] ?? Object.values(flags).find((f) => f.short === name);
          if (def !== undefined && def.type !== 'boolean' && def.type !== 'booleanCount') {
            i++;
          }
        }
        continue;
      }
      const subCmd = this._commands.find((c) => c.name() === arg || c.aliases.includes(arg));
      if (subCmd !== undefined) {
        return subCmd.findTarget([...args.slice(0, i), ...args.slice(i + 1)]);
      }
      // Positional for the current command; stop traversing.
      break;
    }
    return [this, args];
  }

  /** Evaluates the `use` property to extract just the command name. */
  name(): string {
    const [commandName = ''] = this.use.split(' ');
    return commandName;
  }

  /**
   * Generates and prints the help output for this command.
   * Automatically invoked for `--help` or when no `run` function exists.
   */
  help() {
    console.log();
    if (this.short !== '') {
      console.log(this.short);
      console.log();
    }
    this.usage();
    if (this.aliases.length > 0) {
      console.log('Aliases:');
      console.log(`  ${[this.name(), ...this.aliases].join(', ')}`);
      console.log();
    }
  }

  /**
   * Generates and prints the usage summary, listing subcommands and flags.
   */
  usage() {
    console.log('Usage:');
    console.log(`  ${this.use}${this._commands.length > 0 ? ' [command]' : ''}`);
    console.log();

    if (this._commands.length > 0) {
      const namePad = Math.max(...this._commands.map((c) => c.name().length));
      console.log('Available Commands:');
      for (const command of this._commands) {
        const aliases = command.aliases.length > 0 ? ` (${command.aliases.join(', ')})` : '';
        console.log(`  ${command.name().padEnd(namePad)}  ${command.short}${aliases}`);
      }
      console.log();
    }

    const localFlags: Record<string, FlagDef> = {};
    const globalFlags: Record<string, FlagDef> = {};
    for (const [key, def] of Object.entries(this.getInheritedFlags())) {
      if (this._flags[key] !== undefined) {
        localFlags[key] = def;
      } else {
        globalFlags[key] = def;
      }
    }

    const printFlagSection = (title: string, flags: Record<string, FlagDef>): void => {
      const keys = Object.keys(flags);
      if (keys.length === 0) {
        return;
      }
      const pad = Math.max(...keys.map((k) => k.length));
      console.log(`${title}:`);
      for (const key of keys) {
        const flag = flags[key];
        if (flag === undefined) {
          continue;
        }
        const shortPrefix = flag.short !== undefined ? `-${flag.short}, ` : '    ';
        const defaultSuffix = Command.formatDefaultSuffix(flag.defaultValue);
        const requiredSuffix = flag.required === true ? ' (required)' : '';
        const description = flag.description ?? '';
        console.log(
          `  ${shortPrefix}--${key.padEnd(pad)} ${description}${defaultSuffix}${requiredSuffix}`,
        );
      }
      console.log();
    };

    printFlagSection('Flags', localFlags);
    printFlagSection('Global Flags', globalFlags);
  }

  private static buildParseOptions(flags: Record<string, FlagDef>): ParseArgsOptionsConfig {
    const parseOptions: ParseArgsOptionsConfig = {};
    for (const [key, flag] of Object.entries(flags)) {
      const isBoolean = flag.type === 'boolean' || flag.type === 'booleanCount';
      parseOptions[key] = {
        type: isBoolean ? 'boolean' : 'string',
        ...(flag.short !== undefined ? { short: flag.short } : {}),
        ...(flag.type === 'booleanCount' ? { multiple: true } : {}),
      };
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
    switch (flag.type) {
      case 'string':
        return typeof rawValue === 'string' ? rawValue : undefined;
      case 'boolean':
        return typeof rawValue === 'boolean' ? rawValue : undefined;
      case 'integer': {
        if (typeof rawValue !== 'string') {
          return undefined;
        }
        const parsed = Command.parseInteger(rawValue);
        if (parsed === undefined) {
          throw new Error(`invalid integer value "${rawValue}" for flag "${flagName}"`);
        }
        return parsed;
      }
      case 'booleanCount':
        if (Array.isArray(rawValue)) {
          return rawValue.filter((e): e is boolean => e === true).length;
        }
        return rawValue === true ? 1 : 0;
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

  private static formatDefaultSuffix(defaultValue: FlagValue | undefined): string {
    if (defaultValue === undefined) {
      return '';
    }
    return ` (default ${JSON.stringify(defaultValue)})`;
  }

  private static errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private static findInheritedHook(
    start: Command,
    key: 'persistentPreRun' | 'persistentPostRun',
  ): RunFunc | undefined {
    for (
      let current: Command | undefined = start;
      current !== undefined;
      current = current._parent
    ) {
      const hook = current[key];
      if (hook !== undefined) {
        return hook;
      }
    }
    return undefined;
  }
}
