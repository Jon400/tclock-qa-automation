import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { ZodType } from 'zod'

export async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

export async function readText(filePath: string): Promise<string> {
  if (!(await exists(filePath))) {
    throw new Error(`File not found: ${filePath}`)
  }
  return readFile(filePath, 'utf8')
}

export async function writeText(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, content, 'utf8')
}

// Reads a JSON file and validates it, so a malformed file fails with a readable message.
export async function readJson<T>(filePath: string, schema: ZodType<T>): Promise<T> {
  const raw: unknown = JSON.parse(await readText(filePath))
  const result = schema.safeParse(raw)
  if (!result.success) {
    throw new Error(`${filePath} does not match its schema:\n${result.error.message}`)
  }
  return result.data
}

export async function writeJson(filePath: string, data: unknown): Promise<void> {
  await writeText(filePath, `${JSON.stringify(data, null, 2)}\n`)
}
