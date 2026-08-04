import { HashRouter, Navigate, Route, Routes } from "react-router-dom"

import "~/styles/base.css"
import { ApplicationProviders, ErrorBoundary } from "~/components/common"
import { DashboardLayout } from "~/components/layout"
import { SettingsPage } from "~/components/settings"
import { AccountPage } from "~/pages/AccountPage"
import { LoginPage } from "~/pages/LoginPage"
import { OutputLibraryPage } from "~/pages/OutputLibraryPage"
import { OverviewPage } from "~/pages/OverviewPage"
import { PromptHistoryPage } from "~/pages/PromptHistoryPage"
import { SignupPage } from "~/pages/SignupPage"
import { SubscriptionPage } from "~/pages/SubscriptionPage"
import { ProtectedRoute } from "~/routes/ProtectedRoute"
import { useApplicationServices } from "~/components/common/ApplicationProviders"

/** Billing store injection stays at the route edge rather than coupling the page to composition. */
const SubscriptionRoute = () => {
  const services = useApplicationServices()
  return <SubscriptionPage store={services.billingStore} />
}

/** Hash routing keeps every dashboard route inside the installed extension document. */
const Dashboard = () => (
  <ErrorBoundary surface="Dashboard">
    <ApplicationProviders>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardLayout />}>
              <Route index element={<OverviewPage />} />
              <Route path="history" element={<PromptHistoryPage />} />
              <Route path="outputs" element={<OutputLibraryPage />} />
              <Route path="subscription" element={<SubscriptionRoute />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="account" element={<AccountPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </ApplicationProviders>
  </ErrorBoundary>
)

export default Dashboard
