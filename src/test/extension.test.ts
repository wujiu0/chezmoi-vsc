import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension activation', () => {
  test('activates and registers core commands', async () => {
    const ext = vscode.extensions.all.find((e) => e.packageJSON?.name === 'chezmoi-vsc');
    assert.ok(ext, 'extension under development should be loaded');

    await ext.activate();

    const commands = await vscode.commands.getCommands(true);
    for (const id of [
      'chezmoi-vsc.apply',
      'chezmoi-vsc.openPreviewToSide',
      'chezmoi-vsc.showStatus',
      'chezmoi-vsc.refresh',
    ]) {
      assert.ok(commands.includes(id), `command ${id} should be registered`);
    }
  });
});
