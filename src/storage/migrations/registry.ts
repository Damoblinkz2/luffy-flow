import type { StorageMigration } from "../contracts"

/** Version one has no migrations; later stages append immutable, idempotent steps here. */
export const storageMigrations: readonly StorageMigration[] = []
