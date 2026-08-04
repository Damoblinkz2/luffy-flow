import { HashRouter, Route, Routes } from "react-router-dom"

import "~/styles/base.css"
import { ApplicationProviders, ErrorBoundary } from "~/components/common"
import { SettingsPage } from "~/components/settings"
import { LoginPage } from "~/pages/LoginPage"
import { SignupPage } from "~/pages/SignupPage"
import { ProtectedRoute } from "~/routes/ProtectedRoute"

/** Options reuses the validated settings page while retaining an independent auth gate. */
const Options = () => (
  <ErrorBoundary surface="Options">
    <ApplicationProviders>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route element={<ProtectedRoute />}>
            <Route
              index
              element={
                <main className="mx-auto max-w-5xl p-6">
                  <SettingsPage source="options" />
                </main>
              }
            />
          </Route>
        </Routes>
      </HashRouter>
    </ApplicationProviders>
  </ErrorBoundary>
)

export default Options
