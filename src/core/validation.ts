/**
 * SHOES OS — Data integrity rules.
 * Every write goes through these. Mirrors the CHECK constraints and
 * state machine in SQL, so a bad row can never be created from the UI
 * and can never be created from a webhook either.
 */
import type { OrderStatus } from './types';
import { STATUS_TRANSITIONS } from './enums';

export class DomainError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'DomainError';
  }
}

/* ---------------------------------------------------------------- phone */
/** Moroccan mobile / landline. Accepts 06…, 07…, 05…, +212…, 00212… */
export function normalizePhone(raw: string): string {
  const digits = (raw ?? '').replace(/[^\d+]/g, '');
  let d = digits.replace(/^\+/, '');
  if (d.startsWith('00212')) d = '0' + d.slice(5);
  else if (d.startsWith('212')) d = '0' + d.slice(3);
  return d;
}

export function isValidMoroccanPhone(raw: string): boolean {
  const d = normalizePhone(raw);
  return /^0[5-7]\d{8}$/.test(d);
}

export function assertPhone(raw: string): string {
  const p = normalizePhone(raw);
  if (!isValidMoroccanPhone(p)) {
    throw new DomainError('INVALID_PHONE', 'رقم الهاتف غير صحيح (مثال: 0612345678)');
  }
  return p;
}

/* --------------------------------------------------------------- prices */
export function assertPrice(value: number, field = 'السعر'): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new DomainError('INVALID_PRICE', `${field} يجب أن يكون رقماً موجباً`);
  }
  if (value > 1_000_000) {
    throw new DomainError('INVALID_PRICE', `${field} كبير بشكل غير منطقي`);
  }
  return Math.round(value * 100) / 100;
}

export function assertQuantity(q: number): number {
  if (!Number.isInteger(q) || q <= 0) {
    throw new DomainError('INVALID_QTY', 'الكمية يجب أن تكون عدداً صحيحاً أكبر من صفر');
  }
  return q;
}

/* ------------------------------------------------------- status machine */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (from === to) return;
  if (!canTransition(from, to)) {
    throw new DomainError(
      'INVALID_TRANSITION',
      `لا يمكن الانتقال من "${from}" إلى "${to}"`,
    );
  }
}

/* ------------------------------------------------------------ duplicates */
export interface DuplicateCheckInput {
  phone: string;
  variantIds: string[];
  createdAt: Date;
}

/**
 * Same phone + same SKUs within the window = almost certainly a double
 * submit from the landing page or a re-delivered webhook.
 */
export function isLikelyDuplicate(
  candidate: DuplicateCheckInput,
  existing: DuplicateCheckInput[],
  windowMinutes = 60,
): boolean {
  const key = [...candidate.variantIds].sort().join('|');
  return existing.some((e) => {
    if (normalizePhone(e.phone) !== normalizePhone(candidate.phone)) return false;
    if ([...e.variantIds].sort().join('|') !== key) return false;
    const diff = Math.abs(candidate.createdAt.getTime() - e.createdAt.getTime());
    return diff <= windowMinutes * 60_000;
  });
}

/* ---------------------------------------------------------------- stock */
export function assertStockAvailable(
  available: number, requested: number, allowNegative: boolean, label: string,
): void {
  if (!allowNegative && requested > available) {
    throw new DomainError(
      'STOCK_INSUFFICIENT',
      `المخزون غير كافٍ لـ ${label} — المتوفر ${available}، المطلوب ${requested}`,
    );
  }
}

/* ------------------------------------------------------------- required */
export function assertRequired(value: unknown, field: string): void {
  if (value === null || value === undefined || String(value).trim() === '') {
    throw new DomainError('REQUIRED', `${field} مطلوب`);
  }
}
