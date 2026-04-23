import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { Command } from '../src/index.js';

describe('Command Execution lifecycle and Routing', () => {
  it('executes a single root command successfully', async () => {
    const runMock = mock.fn();
    const rootCmd = new Command({ use: 'root', run: runMock });

    await rootCmd.execute([]);

    assert.equal(runMock.mock.callCount(), 1);
  });

  it('routes correctly to a child command', async () => {
    const rootMock = mock.fn();
    const childMock = mock.fn();

    const rootCmd = new Command({ use: 'root', run: rootMock });
    const childCmd = new Command({ use: 'child', run: childMock });
    rootCmd.addCommand(childCmd);

    await rootCmd.execute(['child']);

    assert.equal(rootMock.mock.callCount(), 0);
    assert.equal(childMock.mock.callCount(), 1);
  });

  it('passes positional arguments properly to command', async () => {
    let capturedArgs: string[] = [];
    const rootCmd = new Command({
      use: 'root',
      run: ({ args }) => {
        capturedArgs = args;
      },
    });

    await rootCmd.execute(['arg1', 'arg2']);

    assert.deepEqual(capturedArgs, ['arg1', 'arg2']);
  });

  it('invokes aliases correctly', async () => {
    const childMock = mock.fn();
    const rootCmd = new Command({ use: 'root' });
    const childCmd = new Command({ use: 'child', aliases: ['kid', 'boy'], run: childMock });
    rootCmd.addCommand(childCmd);

    await rootCmd.execute(['kid']);
    await rootCmd.execute(['boy']);

    assert.equal(childMock.mock.callCount(), 2);
  });

  it('handles unknown command by executing root and passing as arguments if not strictly an error (or showing usage)', async () => {
    let capturedArgs: string[] = [];
    const rootCmd = new Command({
      use: 'root',
      run: ({ args }) => {
        capturedArgs = args;
      },
    });

    await rootCmd.execute(['unknown']);

    // Since there is no subcommand named 'unknown', it gets treated as a positional arg for root
    assert.deepEqual(capturedArgs, ['unknown']);
  });

  it('gracefully handles missing run function by showing help', async () => {
    const rootCmd = new Command({ use: 'root' });
    const helpSpy = mock.method(rootCmd, 'help', () => undefined);

    try {
      await rootCmd.execute([]);
      assert.ok(helpSpy.mock.callCount() > 0);
    } finally {
      helpSpy.mock.restore();
    }
  });

  it('executes hooks in the exact required order', async () => {
    const execOrder: string[] = [];

    const root = new Command({
      use: 'root',
      persistentPreRun: () => {
        execOrder.push('root:persistentPreRun');
      },
      persistentPostRun: () => {
        execOrder.push('root:persistentPostRun');
      },
    });

    const child = new Command({
      use: 'child',
      persistentPreRun: () => {
        execOrder.push('child:persistentPreRun');
      },
      preRun: () => {
        execOrder.push('child:preRun');
      },
      run: () => {
        execOrder.push('child:run');
      },
      postRun: () => {
        execOrder.push('child:postRun');
      },
      persistentPostRun: () => {
        execOrder.push('child:persistentPostRun');
      },
    });

    root.addCommand(child);

    // When running child, child's persistentPreRun overrides root's because it searches upwards
    // Wait, let's look at the implementation of runClosestPersistentPreRun:
    // It starts at `this` (the executing command) and traverses up to find the *first* defined hook.
    // So if child has one, root's is ignored.
    await root.execute(['child']);

    assert.deepEqual(execOrder, [
      'child:persistentPreRun',
      'child:preRun',
      'child:run',
      'child:postRun',
      'child:persistentPostRun',
    ]);
  });

  it('executes parent persistent hooks when child does not define them', async () => {
    const execOrder: string[] = [];

    const root = new Command({
      use: 'root',
      persistentPreRun: () => {
        execOrder.push('root:persistentPreRun');
      },
      persistentPostRun: () => {
        execOrder.push('root:persistentPostRun');
      },
    });

    const child = new Command({
      use: 'child',
      preRun: () => {
        execOrder.push('child:preRun');
      },
      run: () => {
        execOrder.push('child:run');
      },
    });

    root.addCommand(child);

    await root.execute(['child']);

    assert.deepEqual(execOrder, [
      'root:persistentPreRun', // Inherited from root
      'child:preRun',
      'child:run',
      'root:persistentPostRun', // Inherited from root
    ]);
  });
});
