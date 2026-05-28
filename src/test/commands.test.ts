import * as assert from 'assert';
import { toTargetRel } from '../commands';
import { StatusEntry } from '../chezmoi/status';

const entry: StatusEntry = {
	targetRelPath: '.zshrc',
	code1: 'M',
	code2: 'M',
	isScript: false,
};

suite('commands: toTargetRel argument normalization', () => {
	test('extracts target path from a tree FileNode (context-menu invocation)', () => {
		const fileNode = { kind: 'file', label: '.zshrc', targetRelPath: '.zshrc', isScript: false };
		assert.strictEqual(toTargetRel(fileNode), '.zshrc');
	});

	test('extracts target path from a StatusEntry (click-command invocation)', () => {
		assert.strictEqual(toTargetRel(entry), '.zshrc');
	});

	test('returns undefined for section/dir nodes and junk', () => {
		assert.strictEqual(toTargetRel({ kind: 'section', label: 'Managed', count: 0, children: [] }), undefined);
		assert.strictEqual(toTargetRel({ kind: 'dir', label: '.config', children: [] }), undefined);
		assert.strictEqual(toTargetRel(undefined), undefined);
		assert.strictEqual(toTargetRel('nope'), undefined);
		assert.strictEqual(toTargetRel(null), undefined);
	});
});
