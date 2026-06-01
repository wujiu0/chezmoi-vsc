import * as assert from 'assert';
import { parseManaged, parseStatus } from '../chezmoi/status';

suite('managed: parse `chezmoi managed` output', () => {
  test('one target path per line, blanks dropped', () => {
    assert.deepStrictEqual(parseManaged('.zprofile\n.zshenv\n.zshrc\n'), ['.zprofile', '.zshenv', '.zshrc']);
  });

  test('CRLF and surrounding whitespace trimmed', () => {
    assert.deepStrictEqual(parseManaged('.zshrc\r\n\n .config/foo \n'), ['.zshrc', '.config/foo']);
  });

  test('empty output yields no paths', () => {
    assert.deepStrictEqual(parseManaged(''), []);
  });
});

suite('status: parse `chezmoi status` output', () => {
  test('two-column code with target path', () => {
    const [entry] = parseStatus('MM .zshrc');
    assert.ok(entry);
    assert.strictEqual(entry.targetRelPath, '.zshrc');
    assert.strictEqual(entry.code1, 'M');
    assert.strictEqual(entry.code2, 'M');
    assert.strictEqual(entry.isScript, false);
  });

  test('leading space in first column preserved', () => {
    const [entry] = parseStatus(' M .bashrc');
    assert.ok(entry);
    assert.strictEqual(entry.code1, ' ');
    assert.strictEqual(entry.code2, 'M');
    assert.strictEqual(entry.targetRelPath, '.bashrc');
  });

  test('trailing space in second column with nested path', () => {
    const [entry] = parseStatus('A  .config/nvim/init.lua');
    assert.ok(entry);
    assert.strictEqual(entry.code1, 'A');
    assert.strictEqual(entry.code2, ' ');
    assert.strictEqual(entry.targetRelPath, '.config/nvim/init.lua');
  });

  test('R code marks a script entry', () => {
    const [entry] = parseStatus('R  run_once_install.sh');
    assert.ok(entry);
    assert.strictEqual(entry.isScript, true);
  });

  test('multiple lines, blank lines ignored', () => {
    const entries = parseStatus('MM .zshrc\n\n M .bashrc\n');
    assert.strictEqual(entries.length, 2);
    const [first, second] = entries;
    assert.ok(first);
    assert.ok(second);
    assert.strictEqual(first.targetRelPath, '.zshrc');
    assert.strictEqual(second.targetRelPath, '.bashrc');
  });

  test('CRLF line endings are handled', () => {
    const [entry] = parseStatus('MM .zshrc\r\n');
    assert.ok(entry);
    assert.strictEqual(entry.targetRelPath, '.zshrc');
  });

  test('empty output yields no entries', () => {
    assert.deepStrictEqual(parseStatus(''), []);
    assert.deepStrictEqual(parseStatus('\n\n'), []);
  });
});
