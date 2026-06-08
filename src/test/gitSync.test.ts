import * as assert from 'assert';
import {
  buildCommitAndPushCommands,
  buildPushArgs,
  buildUpdateArgs,
  parseAheadBehind,
} from '../features/git/sync';

suite('gitSync: argument builders', () => {
  test('buildUpdateArgs → chezmoi update (pull & apply)', () => {
    assert.deepStrictEqual(buildUpdateArgs(), ['update']);
  });

  test('buildPushArgs → git -- push', () => {
    assert.deepStrictEqual(buildPushArgs(), ['git', '--', 'push']);
  });

  test('buildCommitAndPushCommands chains add-all / commit / push', () => {
    assert.deepStrictEqual(buildCommitAndPushCommands('tidy up'), [
      ['git', '--', 'add', '--all'],
      ['git', '--', 'commit', '-m', 'tidy up'],
      ['git', '--', 'push'],
    ]);
  });

  test('commit message with spaces stays a single argument', () => {
    const commit = buildCommitAndPushCommands('feat: add zsh and git config')[1];
    assert.deepStrictEqual(commit, ['git', '--', 'commit', '-m', 'feat: add zsh and git config']);
  });
});

suite('gitSync: parseAheadBehind', () => {
  test('"behind<TAB>ahead" parses both counts with an upstream', () => {
    assert.deepStrictEqual(parseAheadBehind('3\t1\n'), { behind: 3, ahead: 1, hasUpstream: true });
  });

  test('zeros still mean an upstream exists (in sync)', () => {
    assert.deepStrictEqual(parseAheadBehind('0\t0'), { behind: 0, ahead: 0, hasUpstream: true });
  });

  test('space-separated counts are also accepted', () => {
    assert.deepStrictEqual(parseAheadBehind('2 5'), { behind: 2, ahead: 5, hasUpstream: true });
  });

  test('empty output → no upstream', () => {
    assert.deepStrictEqual(parseAheadBehind(''), { behind: 0, ahead: 0, hasUpstream: false });
  });

  test('non-numeric / garbage → no upstream', () => {
    assert.deepStrictEqual(parseAheadBehind('fatal: no upstream'), { behind: 0, ahead: 0, hasUpstream: false });
  });
});
