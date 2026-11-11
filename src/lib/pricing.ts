import { pricing } from '../config';

const DAY = 86_400_000;

/** Local-midnight date from a YYYY-MM-DD string (avoids UTC off-by-one). */
export const parseISODate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Inclusive number of hire days between two dates. */
export const daysBetween = (start: Date, end: Date) => Math.round((end.getTime() - start.getTime()) / DAY) + 1;

export interface Estimate {
  days: number;
  total: number;
  basis: string;
}

/**
 * Cheapest price for an inclusive date range:
 *  - Day rate, plus £15 for every extra day
 *  - Weekend rate (Sat + Sun) when the range includes a full weekend, plus £15 per extra day
 *  - Mon–Fri rate when the range includes a full working week, plus £15 per extra day
 */
export function estimate(start: Date, end: Date): Estimate {
  const days = daysBetween(start, end);
  const option = (label: string, base: number, baseDays: number): Estimate => {
    const extra = days - baseDays;
    return {
      days,
      total: base + pricing.extraDay * extra,
      basis: extra > 0 ? `${label} + ${extra} extra day${extra > 1 ? 's' : ''}` : label,
    };
  };

  const options = [option('Day rate', pricing.day, 1)];
  let hasWeekend = false;
  let hasWeek = false;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (d.getDay() === 6 && addDays(d, 1) <= end) hasWeekend = true;
    if (d.getDay() === 1 && addDays(d, 4) <= end) hasWeek = true;
  }
  if (hasWeekend) options.push(option('Weekend rate', pricing.weekend, 2));
  if (hasWeek) options.push(option('Mon–Fri rate', pricing.weekdays, 5));
  // On a tie, prefer the package rate (it reads better to the customer)
  return options.reduce((a, b) => (b.total <= a.total ? b : a));
}
