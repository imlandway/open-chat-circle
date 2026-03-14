import { execFile } from 'node:child_process';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);
const TEXT_FILE_BYTES_LIMIT = 200_000;

function ensureInsideAllowedRoots(targetPath, allowedRoots) {
  const resolved = resolve(targetPath);
  const allowed = allowedRoots.some((root) => {
    const rel = relative(root, resolved);
    return rel === '' || (!rel.startsWith('..') && !rel.includes(':'));
  });

  if (!allowed) {
    throw new Error(`Path is outside allowed roots: ${resolved}`);
  }

  return resolved;
}

function resolveInputPath(inputPath, config, { fallbackToProjectRoot = true } = {}) {
  if (!inputPath) {
    if (!fallbackToProjectRoot) {
      throw new Error('Path is required.');
    }
    return ensureInsideAllowedRoots(config.defaultProjectRoot, config.allowedRoots);
  }

  const resolved = isAbsolute(inputPath)
    ? resolve(inputPath)
    : resolve(config.defaultProjectRoot, inputPath);

  return ensureInsideAllowedRoots(resolved, config.allowedRoots);
}

async function walkDirectory(rootPath, visit) {
  const entries = await readdir(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    const nextPath = join(rootPath, entry.name);
    if (entry.isDirectory()) {
      await walkDirectory(nextPath, visit);
      continue;
    }
    if (entry.isFile()) {
      await visit(nextPath);
    }
  }
}

export function createToolRunner({ config, browser, uploadImage }) {
  return {
    async fs_list(args = {}) {
      const targetPath = resolveInputPath(args.path, config);
      const entries = await readdir(targetPath, { withFileTypes: true });
      const rows = await Promise.all(entries.map(async (entry) => {
        const nextPath = join(targetPath, entry.name);
        const info = await stat(nextPath);
        return {
          name: entry.name,
          path: nextPath,
          kind: entry.isDirectory() ? 'directory' : 'file',
          size: info.size,
        };
      }));

      return {
        type: 'json',
        text: JSON.stringify(rows, null, 2),
        metadata: {
          path: targetPath,
          entries: rows,
        },
      };
    },

    async fs_read(args = {}) {
      const targetPath = resolveInputPath(args.path, config, { fallbackToProjectRoot: false });
      const buffer = await readFile(targetPath);
      const text = buffer.subarray(0, TEXT_FILE_BYTES_LIMIT).toString('utf8');

      return {
        type: 'text',
        text,
        metadata: {
          path: targetPath,
          truncated: buffer.length > TEXT_FILE_BYTES_LIMIT,
          size: buffer.length,
        },
      };
    },

    async fs_search(args = {}) {
      const query = String(args.query || '').trim();
      if (!query) {
        throw new Error('Search query is required.');
      }

      const basePath = resolveInputPath(args.path, config);
      const matches = [];
      const maxResults = Math.max(1, Math.min(Number(args.maxResults || 20), 100));

      await walkDirectory(basePath, async (filePath) => {
        if (matches.length >= maxResults) {
          return;
        }

        const buffer = await readFile(filePath);
        const text = buffer.subarray(0, TEXT_FILE_BYTES_LIMIT).toString('utf8');
        const lines = text.split(/\r?\n/g);

        lines.forEach((line, index) => {
          if (matches.length >= maxResults) {
            return;
          }
          if (line.toLowerCase().includes(query.toLowerCase())) {
            matches.push({
              path: filePath,
              line: index + 1,
              text: line.trim(),
            });
          }
        });
      });

      return {
        type: 'json',
        text: JSON.stringify(matches, null, 2),
        metadata: {
          path: basePath,
          matches,
        },
      };
    },

    async fs_write(args = {}) {
      const targetPath = resolveInputPath(args.path, config, { fallbackToProjectRoot: false });
      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, String(args.content ?? ''), 'utf8');

      return {
        type: 'text',
        text: `Wrote ${targetPath}`,
        metadata: {
          path: targetPath,
        },
      };
    },

    async shell_run(args = {}) {
      const command = String(args.command || '').trim();
      if (!command) {
        throw new Error('PowerShell command is required.');
      }

      const cwd = resolveInputPath(args.cwd, config);
      const timeoutMs = Math.max(1_000, Math.min(Number(args.timeoutMs || 60_000), 300_000));
      const { stdout, stderr } = await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-Command', command],
        {
          cwd,
          timeout: timeoutMs,
          maxBuffer: 1024 * 1024 * 8,
          windowsHide: false,
        },
      );

      return {
        type: 'text',
        text: [stdout, stderr].filter(Boolean).join('\n').trim(),
        metadata: {
          cwd,
          command,
          timeoutMs,
        },
      };
    },

    async browser_navigate(args = {}) {
      const result = await browser.navigate(String(args.url || '').trim());
      return {
        type: 'json',
        text: JSON.stringify(result, null, 2),
        metadata: result,
      };
    },

    async browser_click(args = {}) {
      const result = await browser.click(String(args.selector || '').trim());
      return {
        type: 'json',
        text: JSON.stringify(result, null, 2),
        metadata: result,
      };
    },

    async browser_type(args = {}) {
      const result = await browser.type(
        String(args.selector || '').trim(),
        String(args.text || ''),
        {
          clear: args.clear !== false,
        },
      );
      return {
        type: 'json',
        text: JSON.stringify(result, null, 2),
        metadata: result,
      };
    },

    async browser_screenshot(args = {}) {
      const fileName = String(args.fileName || `screenshot-${Date.now()}.png`).replace(/[^\w.-]+/g, '-');
      const tempPath = join(tmpdir(), fileName || `screenshot-${Date.now()}.png`);
      await browser.screenshot(tempPath);
      const upload = await uploadImage(tempPath, basename(tempPath));

      return {
        type: 'image',
        text: `Uploaded screenshot ${upload.name}`,
        imageUrl: upload.url,
        imageName: upload.name,
        metadata: upload,
      };
    },
  };
}
