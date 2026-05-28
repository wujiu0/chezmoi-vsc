/**
 * Best-effort mapping from a target filename to a VS Code languageId, so the
 * rendered preview gets sensible syntax highlighting. Returns undefined when
 * unsure — callers then let VS Code auto-detect.
 */

// Matched against the full basename first (dotfiles rarely have extensions).
const NAME_TO_LANGUAGE: Record<string, string> = {
	'.zshrc': 'shellscript',
	'.zshenv': 'shellscript',
	'.zprofile': 'shellscript',
	'.zlogin': 'shellscript',
	'.bashrc': 'shellscript',
	'.bash_profile': 'shellscript',
	'.bash_aliases': 'shellscript',
	'.profile': 'shellscript',
	'.gitconfig': 'properties',
	'.gitignore': 'ignore',
	'.vimrc': 'viml',
	'.tmux.conf': 'shellscript',
	'.editorconfig': 'editorconfig',
	'.npmrc': 'properties',
	'.curlrc': 'properties',
};

const EXT_TO_LANGUAGE: Record<string, string> = {
	'.sh': 'shellscript',
	'.bash': 'shellscript',
	'.zsh': 'shellscript',
	'.fish': 'fish',
	'.ps1': 'powershell',
	'.lua': 'lua',
	'.vim': 'viml',
	'.toml': 'toml',
	'.yaml': 'yaml',
	'.yml': 'yaml',
	'.json': 'json',
	'.jsonc': 'jsonc',
	'.js': 'javascript',
	'.ts': 'typescript',
	'.py': 'python',
	'.rb': 'ruby',
	'.go': 'go',
	'.rs': 'rust',
	'.c': 'c',
	'.cpp': 'cpp',
	'.md': 'markdown',
	'.conf': 'ini',
	'.cfg': 'ini',
	'.ini': 'ini',
	'.xml': 'xml',
	'.html': 'html',
	'.css': 'css',
};

function basename(targetPath: string): string {
	const parts = targetPath.replace(/\\/g, '/').split('/');
	return parts[parts.length - 1] ?? targetPath;
}

export function inferLanguageId(targetPath: string): string | undefined {
	const name = basename(targetPath);

	if (name in NAME_TO_LANGUAGE) {
		return NAME_TO_LANGUAGE[name];
	}

	const dotIndex = name.lastIndexOf('.');
	if (dotIndex > 0) {
		const ext = name.slice(dotIndex).toLowerCase();
		if (ext in EXT_TO_LANGUAGE) {
			return EXT_TO_LANGUAGE[ext];
		}
	}

	return undefined;
}
