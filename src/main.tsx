import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, HashRouter, Route, Routes } from 'react-router-dom'

// VITE_ROUTER=hash produces a build that works on any static host (single HTML file, no rewrite rules).
const Router = import.meta.env.VITE_ROUTER === 'hash' ? HashRouter : BrowserRouter
import './index.css'
import { Layout } from './components/Layout'
import Dashboard from './pages/Dashboard'
import Pipeline from './pages/Pipeline'
import Relances from './pages/Relances'
import Clients from './pages/Clients'
import Devis from './pages/Devis'
import Apporteurs from './pages/Apporteurs'
import Planning from './pages/Planning'
import InstagramPage from './pages/Instagram'
import Kpi from './pages/Kpi'
import Playbook from './pages/Playbook'
import Strategie from './pages/Strategie'
import PointHebdo from './pages/PointHebdo'
import Reglages from './pages/Reglages'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/relances" element={<Relances />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/devis" element={<Devis />} />
          <Route path="/apporteurs" element={<Apporteurs />} />
          <Route path="/planning" element={<Planning />} />
          <Route path="/instagram" element={<InstagramPage />} />
          <Route path="/kpi" element={<Kpi />} />
          <Route path="/playbook" element={<Playbook />} />
          <Route path="/strategie" element={<Strategie />} />
          <Route path="/point-hebdo" element={<PointHebdo />} />
          <Route path="/reglages" element={<Reglages />} />
          <Route path="*" element={<Dashboard />} />
        </Route>
      </Routes>
    </Router>
  </React.StrictMode>,
)
