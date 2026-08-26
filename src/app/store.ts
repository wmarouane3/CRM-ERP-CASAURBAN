/**
 * SHOES OS — Application store.
 * Thin layer over the DataPort: holds the snapshot, the session, the
 * global date range, and the toast queue. No business logic lives here.
 */
import { create } from 'zustand';
import type {
  AppUser, DataSet, Order, OrderStatus, UUID,
} from '../core/types';
import { resolveRange, type DateRange, type RangeKey } from '../core/dates';
import { can, type Permission } from '../core/permissions';
import { DomainError } from '../core/validation';
import { dataPort, backendMode } from '../data';
import type { NewOrderInput, StockAdjustInput } from '../data/ports';
import { DemoAdapter } from '../data/demo/adapter';

export interface Toast {
  id: string; tone: 'success' | 'error' | 'info'; title: string; body?: string;
}

interface AppState {
  db: DataSet | null;
  user: AppUser | null;
  ready: boolean;
  version: number;
  range: DateRange;
  rangeKey: RangeKey;
  customRange: { from: string; to: string };
  toasts: Toast[];
  sidebarOpen: boolean;

  init: () => Promise<void>;
  refresh: () => Promise<void>;
  setRange: (key: RangeKey, custom?: { from: string; to: string }) => void;
  toast: (t: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
  setSidebar: (open: boolean) => void;
  switchUser: (id: UUID) => void;
  allows: (p: Permission) => boolean;

  run: <T>(fn: () => Promise<T>, success?: string) => Promise<T | undefined>;

  createOrder: (input: NewOrderInput) => Promise<Order | undefined>;
  setOrderStatus: (id: UUID, status: OrderStatus, reason?: string) => Promise<void>;
  updateOrder: (id: UUID, patch: Partial<Order>) => Promise<void>;
  adjustStock: (input: StockAdjustInput) => Promise<void>;
}

export const useApp = create<AppState>((set, get) => ({
  db: null,
  user: null,
  ready: false,
  version: 0,
  range: resolveRange('last30'),
  rangeKey: 'last30',
  customRange: { from: '', to: '' },
  toasts: [],
  sidebarOpen: false,

  async init() {
    const port = dataPort();
    const [db, user] = await Promise.all([port.load(), port.currentUser()]);
    set({ db, user, ready: true, version: get().version + 1 });
  },

  async refresh() {
    const db = await dataPort().load();
    set({ db: { ...db }, version: get().version + 1 });
  },

  setRange(key, custom) {
    set({
      rangeKey: key,
      customRange: custom ?? get().customRange,
      range: resolveRange(key, custom ?? get().customRange),
    });
  },

  toast(t) {
    const id = Math.random().toString(36).slice(2);
    set({ toasts: [...get().toasts, { ...t, id }] });
    setTimeout(() => get().dismissToast(id), 4200);
  },
  dismissToast(id) { set({ toasts: get().toasts.filter((t) => t.id !== id) }); },
  setSidebar(open) { set({ sidebarOpen: open }); },

  switchUser(id) {
    const port = dataPort();
    if (port instanceof DemoAdapter) {
      const u = port.switchUser(id);
      set({ user: u, version: get().version + 1 });
    }
  },

  allows(p) {
    const u = get().user;
    return u ? can(u.role, p) : false;
  },

  async run(fn, success) {
    try {
      const result = await fn();
      await get().refresh();
      if (success) get().toast({ tone: 'success', title: success });
      return result;
    } catch (err) {
      const e = err as DomainError;
      get().toast({
        tone: 'error',
        title: e instanceof DomainError ? e.message : 'حدث خطأ',
        body: e instanceof DomainError ? undefined : (err as Error).message,
      });
      return undefined;
    }
  },

  createOrder(input) {
    return get().run(() => dataPort().createOrder(input), 'تم إنشاء الطلب');
  },
  async setOrderStatus(id, status, reason) {
    await get().run(() => dataPort().setOrderStatus(id, status, reason), 'تم تحديث حالة الطلب');
  },
  async updateOrder(id, patch) {
    await get().run(() => dataPort().updateOrder(id, patch), 'تم حفظ التعديلات');
  },
  async adjustStock(input) {
    await get().run(() => dataPort().adjustStock(input), 'تم تحديث المخزون');
  },
}));

export { backendMode };
