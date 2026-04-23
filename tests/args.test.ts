import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { Command, ExactArgs, MaximumNArgs, MinimumNArgs, NoArgs } from '../src/index.js';

describe('Arguments Validation', () => {
  afterEach(() => {
    process.exitCode = undefined;
  });

  it('NoArgs allows 0 arguments', () => {
    const cmd = new Command({ use: 'cmd', args: NoArgs() });
    const err = cmd.args?.({ cmd, args: [] });
    assert.equal(err, undefined);
  });

  it('NoArgs rejects >0 arguments', () => {
    const cmd = new Command({ use: 'cmd', args: NoArgs() });
    const err = cmd.args?.({ cmd, args: ['arg1'] });
    assert.ok(err instanceof Error);
    assert.equal(err.message, 'accepts 0 arg(s), received 1');
  });

  it('MinimumNArgs accepts valid count', () => {
    const cmd = new Command({ use: 'cmd', args: MinimumNArgs(2) });
    const err = cmd.args?.({ cmd, args: ['arg1', 'arg2'] });
    assert.equal(err, undefined);
  });

  it('MinimumNArgs accepts greater count', () => {
    const cmd = new Command({ use: 'cmd', args: MinimumNArgs(2) });
    const err = cmd.args?.({ cmd, args: ['arg1', 'arg2', 'arg3'] });
    assert.equal(err, undefined);
  });

  it('MinimumNArgs rejects insufficient count', () => {
    const cmd = new Command({ use: 'cmd', args: MinimumNArgs(2) });
    const err = cmd.args?.({ cmd, args: ['arg1'] });
    assert.ok(err instanceof Error);
    assert.equal(err.message, 'requires at least 2 arg(s), only received 1');
  });

  it('MaximumNArgs accepts valid count', () => {
    const cmd = new Command({ use: 'cmd', args: MaximumNArgs(2) });
    const err = cmd.args?.({ cmd, args: ['arg1', 'arg2'] });
    assert.equal(err, undefined);
  });

  it('MaximumNArgs accepts lesser count', () => {
    const cmd = new Command({ use: 'cmd', args: MaximumNArgs(2) });
    const err = cmd.args?.({ cmd, args: ['arg1'] });
    assert.equal(err, undefined);
  });

  it('MaximumNArgs rejects greater count', () => {
    const cmd = new Command({ use: 'cmd', args: MaximumNArgs(2) });
    const err = cmd.args?.({ cmd, args: ['arg1', 'arg2', 'arg3'] });
    assert.ok(err instanceof Error);
    assert.equal(err.message, 'accepts at most 2 arg(s), received 3');
  });

  it('ExactArgs accepts exact count', () => {
    const cmd = new Command({ use: 'cmd', args: ExactArgs(3) });
    const err = cmd.args?.({ cmd, args: ['1', '2', '3'] });
    assert.equal(err, undefined);
  });

  it('ExactArgs rejects fewer arguments', () => {
    const cmd = new Command({ use: 'cmd', args: ExactArgs(3) });
    const err = cmd.args?.({ cmd, args: ['1', '2'] });
    assert.ok(err instanceof Error);
    assert.equal(err.message, 'accepts 3 arg(s), received 2');
  });

  it('ExactArgs rejects more arguments', () => {
    const cmd = new Command({ use: 'cmd', args: ExactArgs(3) });
    const err = cmd.args?.({ cmd, args: ['1', '2', '3', '4'] });
    assert.ok(err instanceof Error);
    assert.equal(err.message, 'accepts 3 arg(s), received 4');
  });
});
