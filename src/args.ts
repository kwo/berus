import { type ArgsFunc } from './command.js';

export function ExactArgs(n: number): ArgsFunc {
  return (_cmd, args: string[]) => {
    if (args.length !== n) {
      return new Error(`accepts ${String(n)} arg(s), received ${String(args.length)}`);
    }
    return undefined;
  };
}

export function MinimumNArgs(n: number): ArgsFunc {
  return (_cmd, args: string[]) => {
    if (args.length < n) {
      return new Error(
        `requires at least ${String(n)} arg(s), only received ${String(args.length)}`,
      );
    }
    return undefined;
  };
}

export function MaximumNArgs(n: number): ArgsFunc {
  return (_cmd, args: string[]) => {
    if (args.length > n) {
      return new Error(`accepts at most ${String(n)} arg(s), received ${String(args.length)}`);
    }
    return undefined;
  };
}

export function NoArgs(): ArgsFunc {
  return ExactArgs(0);
}
