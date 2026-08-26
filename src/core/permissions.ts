/**
 * SHOES OS — Role Based Access Control.
 * Mirrors fn_role_has() / fn_can() in SQL.
 *
 * The UI uses this to hide what you cannot do.
 * The DATABASE uses the SQL twin to make sure you cannot do it even if
 * you call the API directly. The browser copy is convenience, not security.
 */
import type { UserRole } from './types';

export type Module =
  | 'dashboard' | 'orders' | 'customers' | 'products' | 'inventory'
  | 'shipping' | 'marketing' | 'finance' | 'analytics' | 'reports'
  | 'goals' | 'settings' | 'users' | 'audit' | 'demo' | 'integrations';

export type Action = 'view' | 'create' | 'edit' | 'delete' | 'export' | 'manage' | 'reset';
export type Permission = `${Module}.${Action}`;

const ALL_MODULES: Module[] = [
  'dashboard', 'orders', 'customers', 'products', 'inventory', 'shipping',
  'marketing', 'finance', 'analytics', 'reports', 'goals', 'settings',
  'users', 'audit', 'demo', 'integrations',
];

const ROLE_MODULES: Record<UserRole, Module[]> = {
  admin: ALL_MODULES,
  manager: ALL_MODULES.filter((m) => !['users', 'demo'].includes(m)),
  order_manager: ['dashboard', 'orders', 'customers', 'shipping', 'reports', 'analytics'],
  warehouse: ['dashboard', 'products', 'inventory', 'orders', 'shipping'],
  marketing: ['dashboard', 'marketing', 'analytics', 'reports', 'customers'],
  viewer: ALL_MODULES,
};

/**
 * Read-only access a role needs OUTSIDE the modules it owns.
 * Without these the product breaks in practice: Marketing cannot measure a
 * campaign without reading orders, and an Order Manager cannot fill a new
 * order without reading the catalogue and its stock.
 * Mirrors the same lists in fn_role_has() (0002_functions.sql).
 */
const READ_EXTRA: Partial<Record<UserRole, Module[]>> = {
  order_manager: ['products', 'inventory', 'marketing'],
  marketing: ['orders', 'shipping', 'products'],
};

export function can(role: UserRole, permission: Permission): boolean {
  const [mod, action] = permission.split('.') as [Module, Action];
  if (role === 'admin') return true;

  if (!ROLE_MODULES[role]?.includes(mod)) {
    // outside its own modules a role may still read
    return action === 'view' && (READ_EXTRA[role]?.includes(mod) ?? false);
  }

  if (role === 'viewer') return action === 'view' || action === 'export';
  if (action === 'delete') return role === 'manager';
  if (action === 'manage' || action === 'reset') return false;
  if (role === 'warehouse' && mod === 'orders') {
    return action === 'view' || action === 'edit';   // may prepare, not create
  }
  return true;
}

export function visibleModules(role: UserRole): Module[] {
  return ROLE_MODULES[role] ?? [];
}

export const ROLE_DESCRIPTION: Record<UserRole, string> = {
  admin: 'صلاحيات كاملة: كل الوحدات، المستخدمون، الإعدادات، وإعادة ضبط البيانات.',
  manager: 'كل الوحدات ما عدا إدارة المستخدمين وإعدادات النظام الحساسة.',
  order_manager: 'الطلبات والعملاء والشحن والتقارير — بدون المالية ولا الإعلانات.',
  warehouse: 'المنتجات والمخزون وتحضير الطلبات — بدون أسعار البيع ولا الأرباح.',
  marketing: 'الحملات والتحليلات وأداء الإعلانات — بدون تعديل الطلبات.',
  viewer: 'مشاهدة فقط لكل الوحدات، بدون أي تعديل.',
};
