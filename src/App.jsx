import { useEffect, useState } from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import { supabase } from './supabase'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Trips from './pages/Trips'
import TripCard from './pages/TripCard'
import Counterparties from './pages/Counterparties'
import Vehicles from './pages/Vehicles'
import Drivers from './pages/Drivers'
import Help from './pages/Help'
import Support from './pages/Support'
import Money from './pages/Money'
import Documents from './pages/Documents'
import Analytics from './pages/Analytics'

export default function App() {
  const [session, setSession] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  if (session === undefined) return null
  if (!session) return <Login />

  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="brand">TirKolija</div>
        <NavLink to="/" end>Головна</NavLink>
        <NavLink to="/trips">Рейси</NavLink>
        <NavLink to="/money">Гроші</NavLink>
        <NavLink to="/analytics">Аналітика</NavLink>
        <NavLink to="/documents">Документи</NavLink>
        <NavLink to="/counterparties">Контрагенти</NavLink>
        <NavLink to="/vehicles">Машини</NavLink>
        <NavLink to="/drivers">Водії</NavLink>
        <NavLink to="/support">Підтримка</NavLink>
        <NavLink to="/help">Інструкція</NavLink>
        <button className="logout" onClick={() => supabase.auth.signOut()}>Вийти</button>
      </nav>
      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/trips" element={<Trips />} />
          <Route path="/trips/:id" element={<TripCard />} />
          <Route path="/money" element={<Money />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/counterparties" element={<Counterparties />} />
          <Route path="/vehicles" element={<Vehicles />} />
          <Route path="/drivers" element={<Drivers />} />
          <Route path="/help" element={<Help />} />
          <Route path="/support" element={<Support />} />
        </Routes>
      </main>
    </div>
  )
}
