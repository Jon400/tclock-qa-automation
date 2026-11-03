import type { APIRequestContext, APIResponse } from '@playwright/test'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { BaseClient, type StatusRecorder } from '../../../src/api/base-client'

interface FakeCall {
  url: string
  options: Record<string, unknown>
}

function fakeResponse(status: number, body: unknown, statusText = ''): APIResponse {
  return {
    status: () => status,
    statusText: () => statusText,
    url: () => 'https://dev.tclock.co.il/web/thing',
    json: () => Promise.resolve(body)
  } as unknown as APIResponse
}

function fakeRequest(response: APIResponse, calls: FakeCall[]): APIRequestContext {
  return {
    fetch: (url: string, options: Record<string, unknown>) => {
      calls.push({ url, options })
      return Promise.resolve(response)
    }
  } as unknown as APIRequestContext
}

function recorder() {
  const steps: string[] = []
  const checks: { actual: number; expected: number; message: string }[] = []
  const value: StatusRecorder = {
    step: (title, body) => {
      steps.push(title)
      return body()
    },
    check: (actual, expected, message) => {
      checks.push({ actual, expected, message })
    }
  }
  return { value, steps, checks }
}

const ThingSchema = z.object({ id: z.number(), name: z.string() })

class ThingClient extends BaseClient {
  async getThing() {
    return this.parse(await this.executeGet('/web/thing'), ThingSchema)
  }
}

describe('BaseClient', () => {
  it('records the request and a passing status check inside steps', async () => {
    const calls: FakeCall[] = []
    const { value, steps, checks } = recorder()
    const client = new ThingClient(
      fakeRequest(fakeResponse(200, { id: 1, name: 'a' }), calls),
      value
    )

    await client.executeGet('/web/thing', { params: { page: 2 } })

    expect(calls).toEqual([
      {
        url: '/web/thing',
        options: { method: 'GET', failOnStatusCode: false, params: { page: 2 } }
      }
    ])
    expect(steps).toEqual(['GET /web/thing', 'Verify GET status code: expected 200, actual 200'])
    expect(checks).toEqual([expect.objectContaining({ actual: 200, expected: 200 })])
  })

  it('checks the status the caller expects, softly, with the URL and reason in the message', async () => {
    const { value, checks } = recorder()
    const client = new ThingClient(fakeRequest(fakeResponse(403, {}, 'Forbidden'), []), value)

    const response = await client.executePost('/web/thing', { expectedStatus: 201, data: { a: 1 } })

    expect(response.status()).toBe(403)
    expect(checks).toEqual([
      {
        actual: 403,
        expected: 201,
        message:
          'POST https://dev.tclock.co.il/web/thing failed: expected 201, actual 403 | Reason: Forbidden'
      }
    ])
  })

  it('passes an expected error status', async () => {
    const { value, checks } = recorder()
    const client = new ThingClient(fakeRequest(fakeResponse(401, {}), []), value)

    await client.executeGet('/web/thing', { expectedStatus: 401 })

    expect(checks[0]).toMatchObject({ actual: 401, expected: 401 })
  })

  it('parses the body with its schema', async () => {
    const { value } = recorder()
    const client = new ThingClient(
      fakeRequest(fakeResponse(200, { id: 7, name: 'branch' }), []),
      value
    )

    await expect(client.getThing()).resolves.toEqual({ id: 7, name: 'branch' })
  })

  it('fails loudly when the body does not match its schema', async () => {
    const { value } = recorder()
    const client = new ThingClient(fakeRequest(fakeResponse(200, { id: 'seven' }), []), value)

    await expect(client.getThing()).rejects.toThrow(/does not match its schema/)
  })
})
