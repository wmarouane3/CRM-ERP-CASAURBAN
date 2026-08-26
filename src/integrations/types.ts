/**
 * SHOES OS — Integration contracts.
 *
 * Every external system (sales channel, carrier, ad platform, messaging)
 * plugs in through one of these three interfaces. Adding "YouCan" or
 * "Sendit" later means writing one file — no change anywhere else.
 *
 * Secrets NEVER live here or anywhere in the browser bundle. The browser
 * only ever sees the non-secret `config`; tokens live in Supabase Vault
 * and are used exclusively by Edge Functions.
 */
import type { DataSet, Order, Shipment } from '../core/types';
import type { NewOrderInput } from '../data/ports';

export type ProviderKind = 'sales_channel' | 'carrier' | 'ads' | 'messaging' | 'sheet' | 'ai';

export interface ProviderMeta {
  id: string;
  kind: ProviderKind;
  name: string;
  description: string;
  status: 'ready' | 'planned' | 'link_only';
  /** what has to exist before it can be switched on */
  requires: string[];
  docs?: string;
}

/** A sales channel pushes orders INTO Shoes OS. */
export interface SalesChannelAdapter {
  meta: ProviderMeta;
  /** Turn a raw webhook body into a canonical order + idempotency key. */
  parseOrder(payload: unknown, db: DataSet): ParsedExternalOrder | null;
  /** Optional: push a status back to the store. */
  pushFulfillment?(order: Order): Promise<void>;
}

export interface ParsedExternalOrder {
  externalId: string;
  idempotencyKey: string;
  input: NewOrderInput;
  warnings: string[];
}

/** A carrier receives shipments and reports status back. */
export interface CarrierAdapter {
  meta: ProviderMeta;
  createShipment(order: Order): Promise<{ tracking_number: string }>;
  syncStatus(shipment: Shipment): Promise<Shipment['status']>;
  mapStatus(external: string): Shipment['status'];
}

/** An ad platform reports spend/impressions per day. */
export interface AdsAdapter {
  meta: ProviderMeta;
  fetchDailySpend(from: string, to: string): Promise<{
    date: string; campaign_external_id: string;
    spend: number; impressions: number; clicks: number;
  }[]>;
}

export interface MessagingAdapter {
  meta: ProviderMeta;
  buildLink(phone: string, message: string): string;
  send?(phone: string, message: string): Promise<void>;
}
