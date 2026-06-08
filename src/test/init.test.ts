import * as assert from 'assert';
import { buildInitArgs } from '../features/init/init';

suite('init: buildInitArgs', () => {
  test('no repo, no apply → bare init (fresh source dir)', () => {
    assert.deepStrictEqual(buildInitArgs(undefined, false), ['init']);
  });

  test('empty repo string is treated as no repo', () => {
    assert.deepStrictEqual(buildInitArgs('', false), ['init']);
  });

  test('repo without apply', () => {
    assert.deepStrictEqual(buildInitArgs('octocat', false), ['init', 'octocat']);
  });

  test('repo with apply', () => {
    assert.deepStrictEqual(buildInitArgs('https://github.com/octocat/dotfiles.git', true), [
      'init',
      'https://github.com/octocat/dotfiles.git',
      '--apply',
    ]);
  });

  test('apply without a repo still appends --apply', () => {
    assert.deepStrictEqual(buildInitArgs(undefined, true), ['init', '--apply']);
  });
});
