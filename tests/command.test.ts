import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { Command } from '../src/index.js';

describe('Command', () => {
  it('executes the run function', async () => {
    const runMock = mock.fn();
    const cmd = new Command({ use: 'test', run: runMock });

    await cmd.execute([]);

    assert.equal(runMock.mock.callCount(), 1);
  });

  it('routes to subcommands', async () => {
    const rootMock = mock.fn();
    const subMock = mock.fn();

    const root = new Command({ use: 'root', run: rootMock });
    const sub = new Command({ use: 'sub', run: subMock });
    root.addCommand(sub);

    await root.execute(['sub']);

    assert.equal(rootMock.mock.callCount(), 0);
    assert.equal(subMock.mock.callCount(), 1);
  });

  it('handles aliases', async () => {
    const subMock = mock.fn();

    const root = new Command({ use: 'root' });
    const sub = new Command({ use: 'sub', aliases: ['s', 'subcmd'], run: subMock });
    root.addCommand(sub);

    await root.execute(['s']);
    await root.execute(['subcmd']);

    assert.equal(subMock.mock.callCount(), 2);
  });

  it('runs hooks in the correct order', async () => {
    const order: string[] = [];
    const root = new Command({
      use: 'root',
      persistentPreRun: () => {
        order.push('root_persistentPreRun');
      },
      persistentPostRun: () => {
        order.push('root_persistentPostRun');
      },
    });

    const sub = new Command({
      use: 'sub',
      run: () => {
        order.push('sub_run');
      },
    });
    root.addCommand(sub);

    await root.execute(['sub']);

    assert.deepEqual(order, ['root_persistentPreRun', 'sub_run', 'root_persistentPostRun']);
  });
});
