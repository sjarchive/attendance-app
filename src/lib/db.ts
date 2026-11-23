import { PrismaClient } from '@prisma/client'
import { PrismaD1 } from '@prisma/adapter-d1'
import { getCloudflareContext } from '@opennextjs/cloudflare'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Query logging costs per-query serialization time and floods dev.log.
// Opt in with PRISMA_DEBUG=1 when debugging, otherwise stay silent.
function createPrismaClient(): PrismaClient {
  const { env } = getCloudflareContext({ async: false })
  const adapter = new PrismaD1(
    env.DB as unknown as ConstructorParameters<typeof PrismaD1>[0]
  )
  return new PrismaClient({
    adapter,
    ...(process.env.PRISMA_DEBUG === '1' ? { log: ['query'] as const } : {}),
  })
}

function getClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient()
  }
  return globalForPrisma.prisma
}

// The client is created lazily on first use (not at import time): the
// Cloudflare context is only available once the Worker handles a request,
// and module-level `getCloudflareContext()` would throw during the build.
// The proxy keeps `db` usable as a plain client across every route.
export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient() as unknown as Record<string | symbol, unknown>
    const value = client[prop]
    return typeof value === 'function' ? value.bind(client) : value
  },
})
