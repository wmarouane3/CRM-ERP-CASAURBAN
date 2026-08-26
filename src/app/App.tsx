import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useApp } from './store';
import { Shell } from './Layout';
import { visibleModules, type Module } from '../core/permissions';
import Dashboard from '../pages/Dashboard';
import Orders from '../pages/Orders';
import OrderDetail from '../pages/OrderDetail';
import Customers, { CustomerDetail } from '../pages/Customers';
import Products from '../pages/Products';
import Inventory from '../pages/Inventory';
import Shipping from '../pages/Shipping';
import Marketing from '../pages/Marketing';
import Finance from '../pages/Finance';
import Analytics from '../pages/Analytics';
import Reports from '../pages/Reports';
import Goals from '../pages/Goals';
import Settings from '../pages/Settings';

function Guard({ module, children }: { module: Module; children: React.ReactNode }) {
  const { user } = useApp();
  if (user && !visibleModules(user.role).includes(module)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function Splash() {
  return (
    <div className="min-h-screen grid place-items-center bg-ground" dir="rtl">
      <div className="text-center">
        <div className="h-12 w-12 mx-auto rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 grid place-items-center text-white text-lg font-bold animate-pulse">
          S
        </div>
        <p className="mt-4 text-[13px] text-ink-400">جارٍ تحضير SHOES OS…</p>
      </div>
    </div>
  );
}

export default function App() {
  const { ready, init } = useApp();

  useEffect(() => { void init(); }, [init]);

  if (!ready) return <Splash />;

  return (
    <HashRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/orders" element={<Guard module="orders"><Orders /></Guard>} />
          <Route path="/orders/:id" element={<Guard module="orders"><OrderDetail /></Guard>} />
          <Route path="/customers" element={<Guard module="customers"><Customers /></Guard>} />
          <Route path="/customers/:id" element={<Guard module="customers"><CustomerDetail /></Guard>} />
          <Route path="/products" element={<Guard module="products"><Products /></Guard>} />
          <Route path="/inventory" element={<Guard module="inventory"><Inventory /></Guard>} />
          <Route path="/shipping" element={<Guard module="shipping"><Shipping /></Guard>} />
          <Route path="/marketing" element={<Guard module="marketing"><Marketing /></Guard>} />
          <Route path="/finance" element={<Guard module="finance"><Finance /></Guard>} />
          <Route path="/analytics" element={<Guard module="analytics"><Analytics /></Guard>} />
          <Route path="/reports" element={<Guard module="reports"><Reports /></Guard>} />
          <Route path="/goals" element={<Guard module="goals"><Goals /></Guard>} />
          <Route path="/settings" element={<Guard module="settings"><Settings /></Guard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Shell>
    </HashRouter>
  );
}
