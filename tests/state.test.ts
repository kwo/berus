import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Command, RunState } from '../src/index.js';

describe('RunState', () => {
  it('passes state sequentially through persistent hooks and run', async () => {
    const sequence: string[] = [];

    const root = new Command({
      use: 'root',
      persistentPreRun: ({ state }) => {
        sequence.push('persistentPreRun');
        state.set('counter', 1);
        state.set('persistentPreRun', true);
      },
      persistentPostRun: ({ state }) => {
        sequence.push('persistentPostRun');
        const counter = state.get<number>('counter') ?? 0;
        state.set('counter', counter + 1);
        state.set('persistentPostRun', true);

        // Assert the final state here to ensure it's the exact same object
        assert.equal(state.get<boolean>('persistentPreRun'), true);
        assert.equal(state.get<boolean>('run'), true);
      },
    });

    const sub = new Command({
      use: 'sub',
      run: ({ state }) => {
        sequence.push('run');
        const counter = state.get<number>('counter') ?? 0;
        state.set('counter', counter + 1);
        state.set('run', true);
      },
    });

    root.addCommand(sub);
    await root.execute(['sub']);

    assert.deepEqual(sequence, ['persistentPreRun', 'run', 'persistentPostRun']);
  });

  it('provides working set/get/has/delete/clear methods', () => {
    const state = new RunState();

    state.set('foo', 'bar');
    assert.equal(state.get<string>('foo'), 'bar');
    assert.equal(state.has('foo'), true);

    state.delete('foo');
    assert.equal(state.get('foo'), undefined);
    assert.equal(state.has('foo'), false);

    state.set('a', 1);
    state.set('b', 2);
    state.clear();
    assert.equal(state.has('a'), false);
    assert.equal(state.has('b'), false);
  });
});
