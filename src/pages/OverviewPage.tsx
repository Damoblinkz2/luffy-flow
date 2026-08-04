import { useEffect, useState } from "react"
import { useStore } from "zustand"

import { AutomationWorkspace } from "~/components/automation"
import { useApplicationServices } from "~/components/common/ApplicationProviders"

/** Overview combines current usage/record counts with the full dashboard automation workspace. */
export const OverviewPage = () => {
  const services = useApplicationServices()
  const billing = useStore(services.billingStore, (state) => state)
  const [counts, setCounts] = useState({ prompts: 0, outputs: 0 })

  useEffect(() => {
    if (services.billingStore.getState().subscription === null)
      void services.billingStore.getState().load()
    let active = true
    void Promise.all([
      countOwnedRecords(sessionUserId(services.authStore.getState().session), (cursor) =>
        services.repositories.prompts.list({
          limit: 100,
          ...(cursor === undefined ? {} : { cursor }),
        }),
      ),
      countOwnedRecords(sessionUserId(services.authStore.getState().session), (cursor) =>
        services.repositories.outputs.list({
          limit: 100,
          ...(cursor === undefined ? {} : { cursor }),
        }),
      ),
    ])
      .then(([prompts, outputs]) => {
        if (active) setCounts({ prompts, outputs })
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [services])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Overview</h1>
        <p className="af-muted">
          Prepare prompts, control the durable queue, and review recent output.
        </p>
      </div>
      <section className="grid gap-3 sm:grid-cols-3" aria-label="AutoFlow summary">
        <article className="af-card">
          <p className="af-muted">Prompt records</p>
          <p className="text-2xl font-semibold">{counts.prompts.toLocaleString()}</p>
        </article>
        <article className="af-card">
          <p className="af-muted">Saved outputs</p>
          <p className="text-2xl font-semibold">{counts.outputs.toLocaleString()}</p>
        </article>
        <article className="af-card">
          <p className="af-muted">Monthly usage</p>
          <p className="text-2xl font-semibold">
            {billing.usage === null ? "—" : `${billing.usage.used}/${billing.usage.limit}`}
          </p>
        </article>
      </section>
      <AutomationWorkspace source="dashboard" />
    </div>
  )
}

const sessionUserId = (session: { user: { id: string } } | null): string | null =>
  session?.user.id ?? null

const countOwnedRecords = async (
  userId: string | null,
  read: (
    cursor: string | undefined,
  ) => Promise<{ items: { userId: string }[]; nextCursor?: string }>,
): Promise<number> => {
  if (userId === null) return 0
  let count = 0
  let cursor: string | undefined
  do {
    const page = await read(cursor)
    count += page.items.filter((record) => record.userId === userId).length
    cursor = page.nextCursor
  } while (cursor !== undefined)
  return count
}
