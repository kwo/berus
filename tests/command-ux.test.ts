import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { Command } from '../src/index.js';

describe('Command UX and Grouping', () => {
  it('hides commands', () => {
    const root = new Command({ use: 'root' });
    const sub = new Command({ use: 'secret', hidden: true });
    root.addCommand(sub);

    const logSpy = mock.method(console, 'log', () => undefined);

    try {
      root.help();
      const output = logSpy.mock.calls.map((call) => String(call.arguments[0])).join('\n');
      assert.equal(output.includes('secret'), false);
    } finally {
      logSpy.mock.restore();
    }
  });

  it('prints deprecated warnings', async () => {
    const root = new Command({ use: 'root', deprecated: 'use something else' });
    const warnSpy = mock.method(console, 'warn', () => undefined);

    try {
      await root.execute([]);
      assert.equal(
        warnSpy.mock.calls[0]?.arguments[0],
        'Command "root" is deprecated, use something else',
      );
    } finally {
      warnSpy.mock.restore();
    }
  });

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
});
