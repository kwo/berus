import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { Command } from '../src/index.js';

describe('Command UX and Grouping', () => {
  it('groups commands in help output', () => {
    const root = new Command({ use: 'root' });
    root.addGroup('db', 'Database Commands');

    const db1 = new Command({ use: 'migrate', groupID: 'db' });
    const db2 = new Command({ use: 'seed', groupID: 'db' });
    const other = new Command({ use: 'ping' });

    root.addCommand(db1, db2, other);

    const logSpy = mock.method(console, 'log', () => undefined);

    try {
      root.help();

      const logs = logSpy.mock.calls.map((call) => String(call.arguments[0])).join('\n');
      assert.equal(logs.includes('Database Commands:'), true);
      assert.equal(logs.includes('migrate'), true);
      assert.equal(logs.includes('seed'), true);
      assert.equal(logs.includes('Other Commands:'), true);
      assert.equal(logs.includes('ping'), true);
    } finally {
      logSpy.mock.restore();
    }
  });

  it('splits local and inherited persistent flags in help output', () => {
    const root = new Command({
      use: 'root',
      persistentFlagsConfig: {
        config: { type: 'string', defaultValue: '', description: 'config file' },
      },
    });
    const child = new Command({
      use: 'child',
      flagsConfig: {
        name: { type: 'string', defaultValue: '', description: 'name' },
      },
    });
    root.addCommand(child);

    const logSpy = mock.method(console, 'log', () => undefined);
    try {
      child.help();
      const logs = logSpy.mock.calls.map((call) => String(call.arguments[0])).join('\n');
      const flagsIdx = logs.indexOf('Flags:');
      const globalIdx = logs.indexOf('Global Flags:');
      const nameIdx = logs.indexOf('--name');
      const configIdx = logs.indexOf('--config');

      assert.ok(
        flagsIdx >= 0 && globalIdx > flagsIdx,
        'expected both sections present and ordered',
      );
      assert.ok(nameIdx > flagsIdx && nameIdx < globalIdx, '--name should appear under Flags');
      assert.ok(configIdx > globalIdx, '--config should appear under Global Flags');
    } finally {
      logSpy.mock.restore();
    }
  });

  it('refreshFlags rebuilds internal flag registry after mutating config', async () => {
    const root = new Command({ use: 'root' });
    root.persistentFlagsConfig = {
      database: { type: 'string', defaultValue: '', description: 'db path' },
    };
    root.refreshFlags();

    let captured = '';
    const child = new Command({
      use: 'child',
      run: ({ cmd }) => {
        captured = cmd.flags().getString('database');
      },
    });
    root.addCommand(child);

    await root.execute(['child', '--database', '/tmp/x.db']);
    assert.equal(captured, '/tmp/x.db');
  });
});
