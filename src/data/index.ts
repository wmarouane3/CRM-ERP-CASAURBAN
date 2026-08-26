/**
 * SHOES OS — Data layer factory.
 *
 * The whole application depends on `dataPort()` and nothing else.
 * Configure Supabase → production adapter. Leave it empty → demo adapter.
 * No page, component or formula changes between the two.
 */
import type { DataPort } from './ports';
import { DemoAdapter } from './demo/adapter';
import { SupabaseAdapter } from './supabase/adapter';
import { isSupabaseConfigured } from './supabase/client';

let port: DataPort | null = null;

export function dataPort(): DataPort {
  port ??= isSupabaseConfigured ? new SupabaseAdapter() : new DemoAdapter();
  return port;
}

export const backendMode: 'supabase' | 'demo' = isSupabaseConfigured ? 'supabase' : 'demo';

export type { DataPort, NewOrderInput, StockAdjustInput } from './ports';
