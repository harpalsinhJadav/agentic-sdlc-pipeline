import { promises as fs } from "node:fs";
import path from "node:path";

/** Resolve a model-supplied relative path and guarantee it stays under `root`. */
export function safeJoin(root: string, relative: string): string {
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, relative);
  if (target !== resolvedRoot && !target.startsWith(resolvedRoot + path.sep)) {
    throw new Error(`Refusing to write outside output root: ${relative}`);
  }
  return target;
}

export async function writeFileSafe(
  root: string,
  relative: string,
  contents: string,
): Promise<string> {
  const target = safeJoin(root, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, contents, "utf8");
  return target;
}

export async function readJson<T>(file: string): Promise<T> {
  const raw = await fs.readFile(file, "utf8");
  return JSON.parse(raw) as T;
}

export async function readTextIfExists(file?: string): Promise<string | undefined> {
  if (!file) return undefined;
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return undefined;
  }
}
