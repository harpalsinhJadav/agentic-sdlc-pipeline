import type { GeneratedFile } from "../blackboard.js";

/**
 * The coder/tester agents emit files in a strict delimited format so we can
 * extract them deterministically (no fragile Markdown-fence guessing):
 *
 *   === FILE: src/screens/Wallet.tsx ===
 *   ...file contents...
 *   === END FILE ===
 */
export function parseFileBlocks(
  text: string,
  kind: GeneratedFile["kind"],
): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  const re = /=== FILE: (.+?) ===\r?\n([\s\S]*?)\r?\n=== END FILE ===/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const path = match[1].trim();
    const contents = match[2].replace(/\s+$/, "") + "\n";
    if (path) files.push({ path, contents, kind });
  }
  return files;
}
