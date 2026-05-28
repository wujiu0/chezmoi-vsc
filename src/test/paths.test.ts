import * as assert from 'assert';
import { parseSourcePath, sourceToTarget } from '../chezmoi/paths';

suite('paths: source → target translation', () => {
	test('dot_ prefix becomes leading dot', () => {
		assert.strictEqual(sourceToTarget('dot_zshrc'), '.zshrc');
	});

	test('.tmpl suffix is stripped and flagged', () => {
		const attrs = parseSourcePath('dot_zshrc.tmpl');
		assert.strictEqual(attrs.targetRelPath, '.zshrc');
		assert.strictEqual(attrs.isTemplate, true);
	});

	test('each path segment is decoded independently', () => {
		assert.strictEqual(
			sourceToTarget('private_dot_ssh/private_config'),
			'.ssh/config',
		);
	});

	test('nested non-encoded segments pass through', () => {
		assert.strictEqual(
			sourceToTarget('dot_config/nvim/init.lua'),
			'.config/nvim/init.lua',
		);
	});

	test('stacked attribute prefixes are stripped', () => {
		const attrs = parseSourcePath('encrypted_private_id_rsa');
		assert.strictEqual(attrs.targetRelPath, 'id_rsa');
		assert.strictEqual(attrs.isEncrypted, true);
	});

	test('executable_ prefix is stripped', () => {
		assert.strictEqual(
			sourceToTarget('executable_dot_local/bin/script.sh'),
			'.local/bin/script.sh',
		);
	});

	test('readonly_ and empty_ prefixes are stripped', () => {
		assert.strictEqual(sourceToTarget('readonly_dot_npmrc'), '.npmrc');
		assert.strictEqual(sourceToTarget('empty_dot_hushlogin'), '.hushlogin');
	});

	test('exact_ directory prefix is stripped', () => {
		assert.strictEqual(sourceToTarget('exact_dot_config/foo'), '.config/foo');
	});

	test('symlink_ is stripped and flagged', () => {
		const attrs = parseSourcePath('symlink_dot_vimrc');
		assert.strictEqual(attrs.targetRelPath, '.vimrc');
		assert.strictEqual(attrs.isSymlink, true);
	});

	test('run_ scripts are flagged and modifiers stripped', () => {
		const a = parseSourcePath('run_once_before_install-packages.sh');
		assert.strictEqual(a.isScript, true);
		assert.strictEqual(a.targetRelPath, 'install-packages.sh');

		const b = parseSourcePath('run_onchange_setup-fonts.sh');
		assert.strictEqual(b.isScript, true);
		assert.strictEqual(b.targetRelPath, 'setup-fonts.sh');
	});

	test('create_ type prefix is stripped, template flagged', () => {
		const attrs = parseSourcePath('create_dot_gitconfig.tmpl');
		assert.strictEqual(attrs.targetRelPath, '.gitconfig');
		assert.strictEqual(attrs.isTemplate, true);
	});

	test('literal_ stops further decoding', () => {
		assert.strictEqual(sourceToTarget('literal_dot_foo'), 'dot_foo');
	});

	test('plain names without prefixes are unchanged', () => {
		assert.strictEqual(sourceToTarget('config'), 'config');
	});

	test('backslash separators are normalized', () => {
		assert.strictEqual(
			sourceToTarget('private_dot_ssh\\private_config'),
			'.ssh/config',
		);
	});

	test('a non-template, non-script file has all flags false', () => {
		const attrs = parseSourcePath('dot_gitconfig');
		assert.deepStrictEqual(
			{
				isTemplate: attrs.isTemplate,
				isEncrypted: attrs.isEncrypted,
				isScript: attrs.isScript,
				isSymlink: attrs.isSymlink,
			},
			{ isTemplate: false, isEncrypted: false, isScript: false, isSymlink: false },
		);
	});
});
