import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';
import { Command } from '../src/index.js';

describe('Flags Edge Cases', () => {
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('local flag shadows parent persistent flag', async () => {
    const root = new Command({
      use: 'root',
      persistentFlagsConfig: {
        config: {
          type: 'string',
          short: 'c',
          defaultValue: 'root.json',
          description: 'Root config',
        },
      },
    });

    const child = new Command({
      use: 'child',
      flagsConfig: {
        config: {
          type: 'string',
          short: 'c',
          defaultValue: 'child.json',
          description: 'Child config',
        },
      },
      run: mock.fn(),
    });
    root.addCommand(child);

    // Call child without flag -> should get child default
    await root.execute(['child']);
    assert.equal(child.flags().getString('config'), 'child.json');

    // Call child with flag -> should use child flag definition
    await root.execute(['child', '--config', 'custom.json']);
    assert.equal(child.flags().getString('config'), 'custom.json');
  });

  it('sibling commands do not inherit each others flags', async () => {
    const root = new Command({ use: 'root' });

    const child1 = new Command({
      use: 'child1',
      persistentFlagsConfig: {
        shared: { type: 'string', defaultValue: 'val1', description: 'Shared flag' },
      },
      run: mock.fn(),
    });

    const child2 = new Command({ use: 'child2', run: mock.fn() });

    root.addCommand(child1, child2);

    const errSpy = mock.method(console, 'error', () => undefined);

    try {
      // child2 should NOT have the 'shared' flag
      await root.execute(['child2', '--shared', 'val']);

      // util.parseArgs throws on unknown flags when strict: true
      // Since we swallow errors in Command and print them, we check the spy
      assert.ok(errSpy.mock.callCount() > 0);
      const errOutput = String(errSpy.mock.calls[0]?.arguments[0] ?? '');
      assert.equal(errOutput.includes('Unknown option'), true);
    } finally {
      errSpy.mock.restore();
    }
  });

  it('required flag on child fails execution if missing', async () => {
    const root = new Command({ use: 'root', silenceUsage: true });
    const child = new Command({
      use: 'child',
      flagsConfig: {
        name: { type: 'string', short: 'n', defaultValue: '', description: 'Name', required: true },
      },
      run: mock.fn(),
    });

    root.addCommand(child);

    const errSpy = mock.method(console, 'error', () => undefined);

    try {
      await root.execute(['child']); // Missing --name
      assert.equal(errSpy.mock.calls[0]?.arguments[0], 'Error: required flag(s) "name" not set');
    } finally {
      errSpy.mock.restore();
    }
  });
});
