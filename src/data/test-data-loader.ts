import path from 'node:path'
import type { ZodType } from 'zod'
import { TEST_DATA_DIR } from '../config/paths'
import { readJson } from '../utils/file-utils'

export type Lane = 'ui' | 'api'

// Static inputs live in test-data/<lane>/<area>.json, one file per lane so the two
// test-developer lanes never write the same file. Validated on load.
export function testDataPath(lane: Lane, area: string): string {
  return path.join(TEST_DATA_DIR, lane, `${area}.json`)
}

export function loadTestData<T>(lane: Lane, area: string, schema: ZodType<T>): Promise<T> {
  return readJson(testDataPath(lane, area), schema)
}
