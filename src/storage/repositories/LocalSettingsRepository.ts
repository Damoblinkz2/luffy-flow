import { luffyflowSettingsSchema, type LuffyflowSettings } from "~/schemas"
import type { VersionedNamespace } from "~/storage/contracts"
import type { SettingsRepository } from "~/storage/repositories/contracts"

/** Missing settings are initialized lazily so environment-derived defaults stay testable. */
export class LocalSettingsRepository implements SettingsRepository {
  constructor(
    private readonly namespace: VersionedNamespace<LuffyflowSettings>,
    private readonly createDefaults: () => LuffyflowSettings,
  ) {}

  async get(): Promise<LuffyflowSettings> {
    const existing = await this.namespace.get()
    if (existing !== null) return existing
    return this.namespace.set(luffyflowSettingsSchema.parse(this.createDefaults()))
  }

  save(settings: LuffyflowSettings): Promise<LuffyflowSettings> {
    return this.namespace.set(luffyflowSettingsSchema.parse(settings))
  }
}
