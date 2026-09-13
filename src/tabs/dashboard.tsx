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
import { TokensPage } from "~/pages/TokensPage"
import { ProtectedRoute } from "~/routes/ProtectedRoute"
import { useApplicationServices } from "~/components/common/ApplicationProviders"

/** Billing store injection stays at the route edge rather than coupling the page to composition. */
const TokensRoute = () => {
  const services = useApplicationServices()
  return <TokensPage store={services.billingStore} />
}

/** Hash routing keeps every dashboard route inside the installed extension document. */
const Dashboard = () => (
  <ErrorBoundary surface="Dashboard">
    <ApplicationProviders>
      <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardLayout />}>
              <Route index element={<OverviewPage />} />
              <Route path="history" element={<PromptHistoryPage />} />
              <Route path="outputs" element={<OutputLibraryPage />} />
              <Route path="tokens" element={<TokensRoute />} />
              <Route path="subscription" element={<Navigate to="/tokens" replace />} />
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
