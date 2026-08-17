#!/usr/bin/env node
/**
 * Cursor preToolUse adapter → scripts/architecture-guard.mjs
 * Warn-only: never deny Write/StrReplace.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const allow = (agentMessage) => {
  if (agentMessage) {
    process.stdout.write(
      JSON.stringify({ permission: 'allow', agent_message: agentMessage }),
    );
  }
  process.exit(0);
};

try {
  const raw = await new Promise((resolve) => {
    let buf = '';
    process.stdin.on('data', (c) => (buf += c));
    process.stdin.on('end', () => resolve(buf));
    setTimeout(() => resolve(buf), 2000);
  });

  const cursor = JSON.parse(raw || '{}');
  const tool = cursor.tool_name || '';
  const input = cursor.tool_input || cursor.input || {};
  if (!/^(Write|StrReplace)$/.test(tool)) allow();

  const filePath = input.file_path || input.path || '';
  if (!filePath) allow();

  const toolMap = { Write: 'Write', StrReplace: 'Edit' };
  const claudePayload = {
    tool_name: toolMap[tool] || tool,
    tool_input: {
      file_path: filePath,
      content: input.content ?? input.contents,
      new_string: input.new_string,
    },
  };

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const guard = path.join(root, 'scripts/architecture-guard.mjs');
  const result = spawnSync(process.execPath, [guard], {
    input: JSON.stringify(claudePayload),
    encoding: 'utf8',
    cwd: root,
  });

  if (result.status !== 0) allow();

  const out = JSON.parse(result.stdout || '{}');
  const msg =
    out.agent_message || out.hookSpecificOutput?.additionalContext || '';
  if (msg) allow(msg);
  allow();
} catch {
  allow();
}
