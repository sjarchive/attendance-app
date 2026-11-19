import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Query logging costs per-query serialization time and floods dev.log.
// Opt in with PRISMA_DEBUG=1 when debugging, otherwise stay silent.
const prismaOptions: ConstructorParameters<typeof PrismaClient>[0] =
  process.env.PRISMA_DEBUG === "1" ? { log: ["query"] } : {};

export const db = globalForPrisma.prisma ?? new PrismaClient(prismaOptions);

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
