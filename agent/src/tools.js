import { execFile, spawn } from 'node:child_process';
import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const execFileAsync = promisify(execFile);
const TEXT_FILE_BYTES_LIMIT = 200_000;

function runSpawnedProcess(command, args, { cwd, timeoutMs, input = '' }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (error, result = null) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      if (error) {
        reject(error);
        return;
      }
      resolve(result);
    };

    const timeout = setTimeout(() => {
      child.kill();
      const error = new Error(`Command timed out after ${timeoutMs}ms`);
      error.code = 'ETIMEDOUT';
      finish(error);
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      finish(error);
    });

    child.on('close', (code) => {
      if (code && code !== 0) {
        const error = new Error(stderr || stdout || `Command failed with exit code ${code}`);
        error.code = code;
        error.stdout = stdout;
        error.stderr = stderr;
        finish(error);
        return;
      }

      finish(null, {
        stdout,
        stderr,
      });
    });

    if (input) {
      child.stdin.write(input);
    }
    child.stdin.end();
  });
}

function getNpxExecutable() {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

function buildCodexRelayPrompt({ instruction, history, cwd }) {
  const recentUserHistory = Array.isArray(history)
    ? history
      .slice(-12)
      .map((message) => {
        const role = message?.role === 'assistant' ? 'assistant' : 'user';
        return {
          role,
          text: String(message?.text || '').trim(),
        };
      })
      .filter((message) => message.role === 'user' && message.text)
      .slice(-4, -1)
      .map((message) => message.text)
      .join('\n\n')
    : '';

  return [
    `任务：${String(instruction || '').trim() || '请直接处理当前请求。'}`,
    cwd ? `工作目录：${cwd}` : '',
    recentUserHistory ? `补充上下文：${recentUserHistory.replace(/\s+/g, ' ').trim()}` : '',
    '要求：直接开始执行，不要自我介绍，不要复述题目，不要让用户再发一次任务，默认用中文回复。',
    '结果格式：只输出结果摘要；如果改了文件，列出关键文件；如果跑了命令，概括关键结果。',
  ].filter(Boolean).join(' | ');
}

function toCodexCliErrorMessage(error, executable) {
  const message = String(error?.message || '').trim();
  if (error?.code === 'ENOENT' || /not recognized|cannot find/i.test(message)) {
    return `Codex CLI 未找到。请检查 CHAT_AGENT_CODEX_EXECUTABLE，当前值是 ${executable}。`;
  }

  if (error?.code === 'EACCES' || /access is denied/i.test(message)) {
    return `Codex CLI 无法启动。请把 CHAT_AGENT_CODEX_EXECUTABLE 改成一个当前用户可执行的 Codex 命令。`;
  }

  return message || 'Codex relay 执行失败。';
}

async function runCodexExec({ executable, model, prompt, cwd }) {
  const outputPath = join(tmpdir(), `codex-relay-output-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);

  try {
    const result = await runSpawnedProcess(
      executable,
      [
        'exec',
        '--dangerously-bypass-approvals-and-sandbox',
        '--skip-git-repo-check',
        '--color',
        'never',
        '--model',
        model,
        '--output-last-message',
        outputPath,
        prompt,
      ],
      {
        cwd,
        timeoutMs: 1000 * 60 * 10,
      },
    );

    const combinedOutput = [result.stdout, result.stderr].filter(Boolean).join('\n');
    const lastMessage = await readOutputFile(outputPath) || extractCodexLastMessage(combinedOutput);
    return {
      stdout: lastMessage || result.stdout,
      stderr: lastMessage ? '' : result.stderr,
    };
  } finally {
    await removeFileQuietly(outputPath);
  }
}

async function runCodexViaNpx({ model, prompt, cwd }) {
  const outputPath = join(tmpdir(), `codex-relay-output-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);

  try {
    const result = await runSpawnedProcess(
      process.env.ComSpec || 'cmd.exe',
      [
        '/d',
        '/s',
        '/c',
        getNpxExecutable(),
        '--yes',
        '@openai/codex',
        'exec',
        '--dangerously-bypass-approvals-and-sandbox',
        '--skip-git-repo-check',
        '--color',
        'never',
        '--model',
        model,
        '--output-last-message',
        outputPath,
        prompt,
      ],
      {
        cwd,
        timeoutMs: 1000 * 60 * 10,
      },
    );

    const combinedOutput = [result.stdout, result.stderr].filter(Boolean).join('\n');
    const lastMessage = await readOutputFile(outputPath) || extractCodexLastMessage(combinedOutput);
    return {
      stdout: lastMessage || result.stdout,
      stderr: lastMessage ? '' : result.stderr,
    };
  } finally {
    await removeFileQuietly(outputPath);
  }
}

async function runCodexWithFallback({ executable, model, prompt, cwd }) {
  try {
    const result = await runCodexExec({ executable, model, prompt, cwd });
    return {
      ...result,
      resolvedExecutable: executable,
    };
  } catch (error) {
    const message = String(error?.message || '').trim();
    const shouldFallbackToNpx = (
      executable === 'codex'
      && (error?.code === 'ENOENT' || error?.code === 'EACCES' || error?.code === 'EPERM' || /not recognized|cannot find|access is denied|spawn EPERM/i.test(message))
    );

    if (!shouldFallbackToNpx) {
      throw error;
    }

    const result = await runCodexViaNpx({ model, prompt, cwd });
    return {
      ...result,
      resolvedExecutable: `${getNpxExecutable()} @openai/codex`,
    };
  }
}

async function readOutputFile(filePath) {
  try {
    const raw = await readFile(filePath, 'utf8');
    return String(raw || '').trim();
  } catch {
    return '';
  }
}

function extractCodexLastMessage(rawText) {
  const normalized = String(rawText || '').replace(/\r/g, '').trim();
  if (!normalized) {
    return '';
  }

  const codexMarker = '\ncodex\n';
  const markerIndex = normalized.lastIndexOf(codexMarker);
  if (markerIndex >= 0) {
    return normalized
      .slice(markerIndex + codexMarker.length)
      .replace(/\ntokens used[\s\S]*$/i, '')
      .trim();
  }

  return normalized
    .replace(/^OpenAI Codex[\s\S]*?\nuser\n/si, '')
    .replace(/\ntokens used[\s\S]*$/i, '')
    .trim();
}

async function removeFileQuietly(filePath) {
  try {
    await unlink(filePath);
  } catch {
    // Ignore missing temp files.
  }
}

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
  const tools = {
    async codex_run(args = {}) {
      const cwd = resolveInputPath(args.cwd, config);
      const prompt = buildCodexRelayPrompt({
        instruction: args.instruction,
        history: args.history,
        cwd,
      });

      try {
        const { stdout, stderr, resolvedExecutable } = await runCodexWithFallback({
          executable: config.codexExecutable,
          model: config.codexModel,
          prompt,
          cwd,
        });

        return {
          type: 'text',
          text: [stdout, stderr].filter(Boolean).join('\n').trim() || '[Codex relay]\n已处理完成。',
          metadata: {
            cwd,
            executable: resolvedExecutable,
            model: config.codexModel,
          },
        };
      } catch (error) {
        throw new Error(toCodexCliErrorMessage(error, config.codexExecutable));
      }
    },

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

  return tools;
}
