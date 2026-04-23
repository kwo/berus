import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { Command } from '../src/index.js';

describe('Flags (Advanced)', () => {
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('supports persistent flags', async () => {
    const root = new Command({
      use: 'root',
      persistentFlagsConfig: {
        config: { type: 'string', short: 'c', defaultValue: '', description: 'config file' },
      },
    });

    let capturedConfig = '';
    const subMock = mock.fn();
    const sub = new Command({
      use: 'sub',
      run: ({ cmd }) => {
        subMock();
        capturedConfig = cmd.flags().getString('config');
      },
    });
    root.addCommand(sub);

    await root.execute(['sub', '--config', 'test.json']);

    assert.equal(subMock.mock.callCount(), 1);
    assert.equal(capturedConfig, 'test.json');
  });

  it('supports persistent flags placed before the subcommand name', async () => {
    const root = new Command({
      use: 'root',
      persistentFlagsConfig: {
        config: { type: 'string', short: 'c', defaultValue: '', description: 'config file' },
      },
    });

    let capturedConfig = '';
    const subMock = mock.fn();
    const sub = new Command({
      use: 'sub',
      flagsConfig: {
        name: { type: 'string', defaultValue: '', description: 'name' },
      },
      run: ({ cmd }) => {
        subMock();
        capturedConfig = cmd.flags().getString('config');
      },
    });
    root.addCommand(sub);

    await root.execute(['--config', 'test.json', 'sub', '--name', 'karl']);

    assert.equal(subMock.mock.callCount(), 1);
    assert.equal(capturedConfig, 'test.json');
  });

  it('stores persistent flag values on the declaring ancestor', async () => {
    const rootPreRunValues: Record<string, string> = {};
    const root = new Command({
      use: 'root',
      persistentFlagsConfig: {
        database: { type: 'string', defaultValue: '', description: 'db path' },
      },
      persistentPreRun: ({ cmd }) => {
        // `cmd` is the target child, but the value should still be readable
        // because flags() walks up to the declaring ancestor.
        rootPreRunValues.child = cmd.flags().getString('database');
        rootPreRunValues.root = cmd.root().flags().getString('database');
      },
    });
    const child = new Command({ use: 'child', run: () => undefined });
    root.addCommand(child);

    await root.execute(['child', '--database', '/tmp/x.db']);
    assert.equal(rootPreRunValues.child, '/tmp/x.db');
    assert.equal(rootPreRunValues.root, '/tmp/x.db');
    // The value should physically live on root, not on the child.
    assert.equal(root.flags().getString('database'), '/tmp/x.db');
  });

  it('routes persistent flags through multiple levels of subcommands', async () => {
    const root = new Command({
      use: 'root',
      persistentFlagsConfig: {
        database: { type: 'string', defaultValue: '', description: 'db path' },
      },
    });
    const feed = new Command({ use: 'feed' });
    const listMock = mock.fn();
    let captured = '';
    const list = new Command({
      use: 'list',
      run: ({ cmd }) => {
        listMock();
        captured = cmd.flags().getString('database');
      },
    });
    feed.addCommand(list);
    root.addCommand(feed);

    await root.execute(['--database', '/tmp/x.db', 'feed', 'list']);
    assert.equal(listMock.mock.callCount(), 1);
    assert.equal(captured, '/tmp/x.db');
  });

  it('routes correctly with inline --flag=value before the subcommand', async () => {
    const root = new Command({
      use: 'root',
      persistentFlagsConfig: {
        config: { type: 'string', short: 'c', defaultValue: '', description: 'config file' },
      },
    });

    let captured = '';
    const sub = new Command({
      use: 'sub',
      flagsConfig: { name: { type: 'string', defaultValue: '', description: 'name' } },
      run: ({ cmd }) => {
        captured = cmd.flags().getString('config');
      },
    });
    root.addCommand(sub);

    await root.execute(['--config=test.json', 'sub', '--name', 'karl']);
    assert.equal(captured, 'test.json');
  });

  it('routes correctly with short flag and value before the subcommand', async () => {
    const root = new Command({
      use: 'root',
      persistentFlagsConfig: {
        config: { type: 'string', short: 'c', defaultValue: '', description: 'config file' },
      },
    });

    let captured = '';
    const sub = new Command({
      use: 'sub',
      run: ({ cmd }) => {
        captured = cmd.flags().getString('config');
      },
    });
    root.addCommand(sub);

    await root.execute(['-c', 'test.json', 'sub']);
    assert.equal(captured, 'test.json');
  });

  it('does not consume the subcommand as a value for booleanCount flags', async () => {
    const root = new Command({
      use: 'root',
      persistentFlagsConfig: {
        verbose: { type: 'booleanCount', short: 'v', defaultValue: 0, description: 'verbosity' },
      },
    });

    const subMock = mock.fn();
    const sub = new Command({ use: 'sub', run: () => subMock() });
    root.addCommand(sub);

    await root.execute(['-v', 'sub']);
    assert.equal(subMock.mock.callCount(), 1);
  });

  it('treats `--` as a routing terminator', async () => {
    const rootMock = mock.fn();
    let remaining: string[] = [];
    const root = new Command({
      use: 'root',
      run: ({ args }) => {
        rootMock();
        remaining = args;
      },
    });
    const sub = new Command({ use: 'sub', run: () => undefined });
    root.addCommand(sub);

    await root.execute(['--', 'sub', '--name', 'karl']);
    assert.equal(rootMock.mock.callCount(), 1);
    assert.deepEqual(remaining, ['sub', '--name', 'karl']);
  });

  it('reports unknown flags before the subcommand with a predictable error', async () => {
    const root = new Command({
      use: 'root',
      silenceUsage: true,
      persistentFlagsConfig: {
        config: { type: 'string', short: 'c', defaultValue: '', description: 'config file' },
      },
    });
    const sub = new Command({ use: 'sub', run: () => undefined });
    root.addCommand(sub);

    const errSpy = mock.method(console, 'error', () => undefined);
    try {
      await assert.rejects(root.execute(['--typo', 'x', 'sub']));
      assert.match(String(errSpy.mock.calls[0]?.arguments[0]), /--typo/);
    } finally {
      errSpy.mock.restore();
    }
  });

  it('supports boolean count flags', async () => {
    let verbosityCount = 0;
    const root = new Command({
      use: 'root',
      flagsConfig: {
        verbose: { type: 'booleanCount', short: 'v', defaultValue: 0 },
      },
      run: ({ cmd }) => {
        verbosityCount = cmd.flags().getBooleanCount('verbose');
      },
    });

    await root.execute(['-v', '-v', '--verbose']);
    assert.equal(verbosityCount, 3);
  });

  it('rejects invalid integer values', async () => {
    const root = new Command({
      use: 'root',
      silenceUsage: true,
      flagsConfig: {
        count: { type: 'integer', defaultValue: 0, description: 'count' },
      },
      run: () => undefined,
    });

    const errSpy = mock.method(console, 'error', () => undefined);

    try {
      await assert.rejects(root.execute(['--count', '12abc']));
      assert.equal(
        errSpy.mock.calls[0]?.arguments[0],
        'Error: invalid integer value "12abc" for flag "count"',
      );
    } finally {
      errSpy.mock.restore();
    }
  });

  it('enforces required flags', async () => {
    const root = new Command({
      use: 'root',
      silenceUsage: true,
      flagsConfig: {
        name: { type: 'string', short: 'n', defaultValue: '', description: 'name', required: true },
      },
      run: () => undefined,
    });

    const errSpy = mock.method(console, 'error', () => undefined);

    try {
      await assert.rejects(root.execute([]));
      assert.equal(errSpy.mock.calls[0]?.arguments[0], 'Error: required flag(s) "name" not set');

      errSpy.mock.resetCalls();
      await root.execute(['--name', 'karl']);
      assert.equal(errSpy.mock.callCount(), 0);
    } finally {
      errSpy.mock.restore();
    }
  });
});
