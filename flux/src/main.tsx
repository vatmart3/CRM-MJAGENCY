import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import { AuthGate } from './components/Auth'
import { Layout } from './components/Layout'
import { useIsAdmin } from './store'
import Dashboard from './pages/Dashboard'
import Recettes from './pages/Recettes'
import Depenses from './pages/Depenses'

// Les pages moins fréquentes se chargent à la demande.
const Projets = lazy(() => import('./pages/Projets'))
const ProjetFiche = lazy(() => import('./pages/ProjetFiche'))
const Clients = lazy(() => import('./pages/Clients'))
const Abonnements = lazy(() => import('./pages/Abonnements'))
const Urssaf = lazy(() => import('./pages/Urssaf'))
const Associes = lazy(() => import('./pages/Associes'))
const Exports = lazy(() => import('./pages/Exports'))
const Assistant = lazy(() => import('./pages/Assistant'))
const Journal = lazy(() => import('./pages/Journal'))
const Reglages = lazy(() => import('./pages/Reglages'))

function AdminOnly({ children }: { children: React.ReactNode }) {
  return useIsAdmin() ? <>{children}</> : <Navigate to="/" replace />
}

// VITE_ROUTER=memory : version « un seul fichier » (artefact), sans adresse par page.
const Router = import.meta.env.VITE_ROUTER === 'memory' ? MemoryRouter : BrowserRouter

const Loading = () => <div className="h-40" />

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthGate>
      <Router>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/recettes" element={<Recettes />} />
              <Route path="/depenses" element={<Depenses />} />
              <Route path="/projets" element={<Projets />} />
              <Route path="/projets/:id" element={<ProjetFiche />} />
              <Route path="/clients" element={<Clients />} />
              <Route path="/abonnements" element={<Abonnements />} />
              <Route path="/urssaf" element={<Urssaf />} />
              <Route path="/associes" element={<Associes />} />
              <Route path="/exports" element={<Exports />} />
              <Route path="/assistant" element={<Assistant />} />
              <Route path="/journal" element={<Journal />} />
              <Route path="/reglages" element={<AdminOnly><Reglages /></AdminOnly>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </Suspense>
      </Router>
    </AuthGate>
  </React.StrictMode>,
)
