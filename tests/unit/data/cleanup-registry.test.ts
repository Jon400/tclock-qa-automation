import { describe, expect, it } from 'vitest'
import { CleanupRegistry } from '../../../src/data/cleanup-registry'

describe('CleanupRegistry', () => {
  it('deactivates newest first', async () => {
    const order: string[] = []
    const registry = new CleanupRegistry()
    registry.register('branch', () => Promise.resolve(void order.push('branch')))
    registry.register('user in branch', () => Promise.resolve(void order.push('user in branch')))

    await registry.runAll()

    expect(order).toEqual(['user in branch', 'branch'])
    expect(registry.size).toBe(0)
  })

  it('runs every entry even when one fails, then reports all failures', async () => {
    const ran: string[] = []
    const registry = new CleanupRegistry()
    registry.register('a', () => Promise.resolve(void ran.push('a')))
    registry.register('b', () => Promise.reject(new Error('503')))
    registry.register('c', () => Promise.reject(new Error('timeout')))

    await expect(registry.runAll()).rejects.toThrow(
      /Cleanup failed for 2 entities:\nc: timeout\nb: 503/
    )
    expect(ran).toEqual(['a'])
  })
})
