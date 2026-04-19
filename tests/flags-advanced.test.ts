import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { Command } from '../src/index.js';

describe('Flags (Advanced)', () => {
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('supports persistent flags', async () => {
    const root = new Command({ use: 'root' });
    root.persistentFlags().string('config', 'c', '', 'config file');

    const subMock = mock.fn();
    const sub = new Command({ use: 'sub', run: subMock });
    root.addCommand(sub);

    await root.execute(['sub', '--config', 'test.json']);

    assert.equal(subMock.mock.callCount(), 1);
    assert.equal(sub.flags().getString('config'), 'test.json');
  });

  it('supports string array flags', async () => {
    const root = new Command({ use: 'root' });
    root.flags().stringArray('file', 'f', [], 'files to process');

    await root.execute(['--file', 'a.txt', '-f', 'b.txt']);
    assert.deepEqual(root.flags().getStringArray('file'), ['a.txt', 'b.txt']);
  });

  it('enforces required flags', async () => {
    const root = new Command({ use: 'root', silenceUsage: true });
    root.flags().string('name', 'n', '', 'name');
    root.markFlagRequired('name');

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

  it('hides hidden flags from help', () => {
    const root = new Command({ use: 'root' });
    root.flags().boolean('secret', '', false, 'shh');
    root.markFlagHidden('secret');

    const logSpy = mock.method(console, 'log', () => undefined);

    try {
      root.help();
      const logs = logSpy.mock.calls.map((call) => String(call.arguments[0])).join('\n');
      assert.equal(logs.includes('--secret'), false);
    } finally {
      logSpy.mock.restore();
    }
  });
});
