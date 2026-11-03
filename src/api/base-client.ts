import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test'
import { z, type ZodType } from 'zod'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface RequestOptions {
  // The status the caller expects; checked softly, like itac-arena's exp_status_code.
  expectedStatus?: number
  headers?: Record<string, string>
  params?: Record<string, string | number | boolean>
  data?: unknown
  timeout?: number
}

// How a request and its status check are recorded. Inside Playwright Test: a test.step per
// request with an expect.soft status check, so one wrong status fails the test without
// hiding the rest (itac-arena used an Allure step plus pytest_check). Unit tests pass a
// recorder of their own.
export interface StatusRecorder {
  step<T>(title: string, body: () => Promise<T>): Promise<T>
  check(actual: number, expected: number, message: string): void
}

export const playwrightRecorder: StatusRecorder = {
  step: (title, body) => test.step(title, body),
  check: (actual, expected, message) => {
    expect.soft(actual, message).toBe(expected)
  }
}

// Base for every /web/* client. The APIRequestContext carries the role's session cookies
// (built from the same storage state as the role's browser page), so API and UI share one
// login. Subclasses add one method per endpoint and parse bodies with a zod schema.
export abstract class BaseClient {
  constructor(
    protected readonly request: APIRequestContext,
    private readonly recorder: StatusRecorder = playwrightRecorder
  ) {}

  async executeRequest(
    method: HttpMethod,
    url: string,
    options: RequestOptions = {}
  ): Promise<APIResponse> {
    const { expectedStatus = 200, headers, params, data, timeout } = options
    return this.recorder.step(`${method} ${url}`, async () => {
      const response = await this.request.fetch(url, {
        method,
        failOnStatusCode: false,
        ...(headers ? { headers } : {}),
        ...(params ? { params } : {}),
        ...(data === undefined ? {} : { data }),
        ...(timeout ? { timeout } : {})
      })
      await this.verifyStatus(method, response, expectedStatus)
      return response
    })
  }

  executeGet(url: string, options: Omit<RequestOptions, 'data'> = {}): Promise<APIResponse> {
    return this.executeRequest('GET', url, options)
  }

  executePost(url: string, options: RequestOptions = {}): Promise<APIResponse> {
    return this.executeRequest('POST', url, options)
  }

  executePut(url: string, options: RequestOptions = {}): Promise<APIResponse> {
    return this.executeRequest('PUT', url, options)
  }

  executePatch(url: string, options: RequestOptions = {}): Promise<APIResponse> {
    return this.executeRequest('PATCH', url, options)
  }

  executeDelete(url: string, options: Omit<RequestOptions, 'data'> = {}): Promise<APIResponse> {
    return this.executeRequest('DELETE', url, options)
  }

  async verifyStatus(
    method: HttpMethod,
    response: APIResponse,
    expectedStatus: number
  ): Promise<void> {
    const actual = response.status()
    const reason = response.statusText() ? ` | Reason: ${response.statusText()}` : ''
    await this.recorder.step(
      `Verify ${method} status code: expected ${expectedStatus}, actual ${actual}`,
      () => {
        this.recorder.check(
          actual,
          expectedStatus,
          `${method} ${response.url()} failed: expected ${expectedStatus}, actual ${actual}${reason}`
        )
        return Promise.resolve()
      }
    )
  }

  // Parses a JSON body with its schema. A shape change fails loudly with the field paths.
  protected async parse<T>(response: APIResponse, schema: ZodType<T>): Promise<T> {
    const body: unknown = await response.json()
    const result = schema.safeParse(body)
    if (!result.success) {
      throw new Error(
        `Response from ${response.url()} does not match its schema:\n${z.prettifyError(result.error)}`
      )
    }
    return result.data
  }
}
