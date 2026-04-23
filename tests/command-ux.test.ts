import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { Command } from '../src/index.js';

describe('Command UX', () => {
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

  it('shows subcommand aliases next to command name before description', () => {
    const root = new Command({ use: 'root' });
    const child = new Command({ use: 'child', aliases: ['kid', 'boy'], short: 'child command' });
    root.addCommand(child);

    const logSpy = mock.method(console, 'log', () => undefined);
    try {
      root.help();
      const logs = logSpy.mock.calls.map((call) => String(call.arguments[0])).join('\n');

      assert.match(logs, /child \(kid, boy\)\s+child command/);
      assert.equal(logs.includes('child command (kid, boy)'), false);
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
