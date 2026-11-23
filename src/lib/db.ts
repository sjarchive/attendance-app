import { PrismaClient } from '@prisma/client'
import { PrismaD1 } from '@prisma/adapter-d1'
import { getCloudflareContext } from '@opennextjs/cloudflare'

// Cache PrismaClient per Cloudflare request ExecutionContext (ctx), NOT in
// globalThis. In Cloudflare Workers, D1 bindings are request-scoped I/O
// handles; reusing a PrismaClient across concurrent requests triggers
// "Cannot perform I/O on behalf of a different request" (HTTP 500).
// WeakMap ensures automatic GC when each request completes while reusing one
// client across parallel queries within the same request.
const requestClients = new WeakMap<object, PrismaClient>()

function createPrismaClient(dbBinding: unknown): PrismaClient {
  const adapter = new PrismaD1(
    dbBinding as ConstructorParameters<typeof PrismaD1>[0]
  )
  return new PrismaClient({
    adapter,
    ...(process.env.PRISMA_DEBUG === '1' ? { log: ['query'] as const } : {}),
  })
}

function getClient(): PrismaClient {
  const { env, ctx } = getCloudflareContext({ async: false })
  const dbBinding = (env as unknown as { DB: unknown }).DB
  if (ctx && typeof ctx === 'object') {
    const existing = requestClients.get(ctx)
    if (existing) return existing
    const client = createPrismaClient(dbBinding)
    requestClients.set(ctx, client)
    return client
  }
  return createPrismaClient(dbBinding)
}

// The client is created lazily on first use (not at import time): the
// Cloudflare context is only available once the Worker handles a request,
// and module-level getCloudflareContext() would throw during the build.
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient() as unknown as Record<string | symbol, unknown>
    const value = client[prop]
    return typeof value === 'function' ? value.bind(client) : value
  },
})
