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
      run: (cmd) => {
        subMock();
        capturedConfig = cmd.flags().getString('config');
      },
    });
    root.addCommand(sub);

    await root.execute(['sub', '--config', 'test.json']);

    assert.equal(subMock.mock.callCount(), 1);
    assert.equal(capturedConfig, 'test.json');
  });

  it('supports boolean count flags', async () => {
    let verbosityCount = 0;
    const root = new Command({
      use: 'root',
      flagsConfig: {
        verbose: { type: 'booleanCount', short: 'v', defaultValue: 0 },
      },
      run: (cmd) => {
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
      await root.execute(['--count', '12abc']);
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
      await root.execute([]);
      assert.equal(errSpy.mock.calls[0]?.arguments[0], 'Error: required flag(s) "name" not set');

      errSpy.mock.resetCalls();
      await root.execute(['--name', 'karl']);
      assert.equal(errSpy.mock.callCount(), 0);
    } finally {
      errSpy.mock.restore();
    }
  });
});
