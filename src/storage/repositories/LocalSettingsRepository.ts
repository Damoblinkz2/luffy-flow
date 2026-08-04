import { autoflowSettingsSchema, type AutoflowSettings } from "~/schemas"
import type { VersionedNamespace } from "~/storage/contracts"
import type { SettingsRepository } from "~/storage/repositories/contracts"

/** Missing settings are initialized lazily so environment-derived defaults stay testable. */
export class LocalSettingsRepository implements SettingsRepository {
  constructor(
    private readonly namespace: VersionedNamespace<AutoflowSettings>,
    private readonly createDefaults: () => AutoflowSettings,
  ) {}

  async get(): Promise<AutoflowSettings> {
    const existing = await this.namespace.get()
    if (existing !== null) return existing
    return this.namespace.set(autoflowSettingsSchema.parse(this.createDefaults()))
  }

  save(settings: AutoflowSettings): Promise<AutoflowSettings> {
    return this.namespace.set(autoflowSettingsSchema.parse(settings))
  }
}
