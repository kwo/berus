import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Command } from '../src/index.js';

describe('Declarative Flags', () => {
  it('parses local flags from constructor config', async () => {
    let capturedName = '';
    let capturedAge = 0;
    let capturedCount = 0;

    const cmd = new Command({
      use: 'test',
      flagsConfig: {
        name: { type: 'string', defaultValue: 'bob' },
        age: { type: 'string', defaultValue: '30' },
        count: { type: 'integer', defaultValue: 1 },
      },
      run: (c) => {
        capturedName = c.flags().getString('name');
        capturedAge = Number(c.flags().getString('age'));
        capturedCount = c.flags().getInteger('count');
      },
    });

    await cmd.execute(['--name', 'alice', '--age', '42', '--count', '10']);

    assert.equal(capturedName, 'alice');
    assert.equal(capturedAge, 42);
    assert.equal(capturedCount, 10);
  });

  it('inherits persistent flags from parent constructor config', async () => {
    let capturedVerbose = false;

    const root = new Command({
      use: 'root',
      persistentFlagsConfig: {
        verbose: { type: 'boolean', defaultValue: false, short: 'v' },
      },
    });

    const sub = new Command({
      use: 'sub',
      run: (c) => {
        // Can access via local flags accessor due to inheritance logic
        capturedVerbose = c.flags().getBoolean('verbose');
      },
    });

    root.addCommand(sub);

    await root.execute(['sub', '-v']);
    assert.equal(capturedVerbose, true);
  });
});
