# Hono Testing

> The Hono app can be found at `/home/gabriel-carvalho/Documents/loglog/apps/server/src/index.ts`

---

## Overview

Testing Hono applications is straightforward. The basic steps are the same regardless of the runtime. There are two main approaches: using the **Testing Helper** with a typed client, or making direct requests via `app.request`.

---

## Testing Helper (`testClient`)

### Import

```ts
import { Hono } from 'hono'
import { testClient } from 'hono/testing'
```

### How it works

`testClient()` takes a Hono instance and returns an object typed according to your application's routes, similar to the Hono Client. This allows you to call your defined routes in a type-safe manner with editor autocompletion.

> **Important:** For type inference to work correctly, routes must be defined using chained methods directly on the Hono instance.
>
> ```ts
> // ✅ Works — chained method
> const app = new Hono().get('/search', (c) => { ... })
>
> // ❌ Does not work — route defined separately
> const app = new Hono()
> app.get('/search', (c) => { ... })
> ```

### Basic example

```ts
// index.ts
const app = new Hono().get('/search', (c) => {
  const query = c.req.query('q')
  return c.json({ query: query, results: ['result1', 'result2'] })
})

export default app
```

```ts
// index.test.ts
import { describe, it, expect } from 'vitest'
import { testClient } from 'hono/testing'
import app from './index'

describe('Search Endpoint', () => {
  const client = testClient(app)

  it('should return search results', async () => {
    const res = await client.search.$get({
      query: { q: 'hono' },
    })

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      query: 'hono',
      results: ['result1', 'result2'],
    })
  })
})
```

### Including headers

Pass headers as the second argument of the call. The second parameter also accepts an `init` property of type `RequestInit`.

```ts
it('should return search results with auth', async () => {
  const token = 'this-is-a-very-clean-token'

  const res = await client.search.$get(
    {
      query: { q: 'hono' },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
  )

  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({
    query: 'hono',
    results: ['result1', 'result2'],
  })
})
```

---

## Direct Requests (`app.request`)

For cases where you don't need the typed client, you can create a `Request` and pass it directly to the Hono application using `app.request`.

### GET request

```ts
describe('Example', () => {
  test('GET /posts', async () => {
    const res = await app.request('/posts')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('Many posts')
  })
})
```

### POST request

```ts
test('POST /posts', async () => {
  const res = await app.request('/posts', {
    method: 'POST',
  })
  expect(res.status).toBe(201)
  expect(res.headers.get('X-Custom')).toBe('Thank you')
  expect(await res.json()).toEqual({ message: 'Created' })
})
```

### POST with JSON body

```ts
test('POST /posts with JSON', async () => {
  const res = await app.request('/posts', {
    method: 'POST',
    body: JSON.stringify({ message: 'hello hono' }),
    headers: new Headers({ 'Content-Type': 'application/json' }),
  })
  expect(res.status).toBe(201)
  expect(res.headers.get('X-Custom')).toBe('Thank you')
  expect(await res.json()).toEqual({ message: 'Created' })
})
```

### POST with multipart/form-data

```ts
test('POST /posts with form-data', async () => {
  const formData = new FormData()
  formData.append('message', 'hello')

  const res = await app.request('/posts', {
    method: 'POST',
    body: formData,
  })
  expect(res.status).toBe(201)
  expect(res.headers.get('X-Custom')).toBe('Thank you')
  expect(await res.json()).toEqual({ message: 'Created' })
})
```

### Using a `Request` instance

```ts
test('POST /posts with Request instance', async () => {
  const req = new Request('http://localhost/posts', {
    method: 'POST',
  })
  const res = await app.request(req)
  expect(res.status).toBe(201)
  expect(res.headers.get('X-Custom')).toBe('Thank you')
  expect(await res.json()).toEqual({ message: 'Created' })
})
```

---

## Summary

| Approach | Type-safe | Best for |
|---|---|---|
| `testClient()` | ✅ Yes | Typed, autocomplete-friendly tests |
| `app.request()` | ❌ No | Simple, quick end-to-end style tests |
