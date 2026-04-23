import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { Command } from '../src/index.js';

describe('Flags Edge Cases', () => {
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

    // child2 should NOT have the 'shared' flag; util.parseArgs throws
    // on unknown flags when strict: true.
    await assert.rejects(root.execute(['child2', '--shared', 'val']), /Unknown option/);
  });

  it('required flag on child fails execution if missing', async () => {
    const root = new Command({ use: 'root' });
    const child = new Command({
      use: 'child',
      flagsConfig: {
        name: { type: 'string', short: 'n', defaultValue: '', description: 'Name', required: true },
      },
      run: mock.fn(),
    });

    root.addCommand(child);

    await assert.rejects(root.execute(['child']), /required flag\(s\) "name" not set/);
  });
});
