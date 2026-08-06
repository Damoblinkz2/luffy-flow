import { createContext, useContext, useEffect, useState, type ReactNode } from "react"

import { AuthProvider } from "~/components/auth/AuthProvider"
import {
  createApplicationServices,
  type ApplicationServices,
} from "~/services/create-application-services"

const ServicesContext = createContext<ApplicationServices | null>(null)

export interface ApplicationProvidersProps {
  children: ReactNode
  services?: ApplicationServices
}

/** Every extension document owns one service graph and disposes listeners/database handles on close.*/
export const ApplicationProviders = ({
  children,
  services: supplied,
}: ApplicationProvidersProps) => {
  const [services] = useState(() => supplied ?? createApplicationServices())

  useEffect(() => {
    let active = true
    void services.settingsRepository.get().then((settings) => {
      if (!active) return
      applyTheme(settings.theme)
    })
    return () => {
      active = false
      if (supplied === undefined) services.dispose()
    }
  }, [services, supplied])

  return (
    <ServicesContext.Provider value={services}>
      <AuthProvider store={services.authStore}>{children}</AuthProvider>
    </ServicesContext.Provider>
  )
}

/** Service access is centralized so UI components remain easy to test with an injected graph. */
export const useApplicationServices = (): ApplicationServices => {
  const services = useContext(ServicesContext)
  if (services === null)
    throw new Error("Application services are unavailable outside their provider.")
  return services
}

/** Theme updates are document-local because popup, side panel, and tabs are separate documents. */
export const applyTheme = (theme: "light" | "dark" | "system"): void => {
  const dark =
    theme === "dark" ||
    (theme === "system" && globalThis.matchMedia("(prefers-color-scheme: dark)").matches)
  document.documentElement.classList.toggle("dark", dark)
}
