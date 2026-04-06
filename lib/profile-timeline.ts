import type { ProfileVisitEntry } from '@/lib/api';

export const PROFILE_TIMELINE_LIMIT = 250;

export type TimelineDayGroup = {
  dayKey: string;
  title: string;
  items: ProfileVisitEntry[];
};

function parseTimestamp(value?: string) {
  if (!value) {
    return Number.NaN;
  }

  return Date.parse(value);
}

function entryTimestamp(entry: Pick<ProfileVisitEntry, 'visitedAt'>) {
  return parseTimestamp(entry.visitedAt);
}

function formatDayKey(date: Date) {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfWeek(date: Date) {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  const weekday = normalized.getDay();
  const diffToMonday = weekday === 0 ? 6 : weekday - 1;
  normalized.setDate(normalized.getDate() - diffToMonday);
  return normalized;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function compareEntriesDescending(left: ProfileVisitEntry, right: ProfileVisitEntry) {
  return entryTimestamp(right) - entryTimestamp(left);
}

export function sortTimelineEntries(entries: ProfileVisitEntry[]) {
  return entries.slice().sort(compareEntriesDescending);
}

export function trimTimelineEntries(entries: ProfileVisitEntry[], limit = PROFILE_TIMELINE_LIMIT) {
  return sortTimelineEntries(entries).slice(0, limit);
}

export function upsertTimelineEntry(
  entries: ProfileVisitEntry[],
  entry: ProfileVisitEntry,
  limit = PROFILE_TIMELINE_LIMIT
) {
  const withoutExisting = entries.filter((item) => item.id !== entry.id);
  return trimTimelineEntries([entry, ...withoutExisting], limit);
}

export function updateTimelineEntryTimestamp(
  entries: ProfileVisitEntry[],
  visitId: string,
  visitedAt: string,
  limit = PROFILE_TIMELINE_LIMIT
) {
  const nextEntries = entries.map((item) =>
    item.id === visitId
      ? {
          ...item,
          visitedAt,
        }
      : item
  );

  return trimTimelineEntries(nextEntries, limit);
}

export function replaceTimelineEntry(
  entries: ProfileVisitEntry[],
  optimisticId: string,
  persistedEntry: ProfileVisitEntry,
  limit = PROFILE_TIMELINE_LIMIT
) {
  const withoutOptimistic = entries.filter((item) => item.id !== optimisticId);
  return upsertTimelineEntry(withoutOptimistic, persistedEntry, limit);
}

export function buildTimelinePreview(entries: ProfileVisitEntry[], now = new Date()) {
  const all = trimTimelineEntries(entries);
  const weekStart = startOfWeek(now).getTime();
  const monthStart = startOfMonth(now).getTime();

  return {
    all,
    thisWeek: all.filter((entry) => {
      const timestamp = entryTimestamp(entry);
      return Number.isFinite(timestamp) && timestamp >= weekStart;
    }),
    thisMonth: all.filter((entry) => {
      const timestamp = entryTimestamp(entry);
      return Number.isFinite(timestamp) && timestamp >= monthStart;
    }),
  };
}

export function groupTimelineEntriesByDay(entries: ProfileVisitEntry[], locale = 'de-DE') {
  const groups = new Map<string, { date: Date; items: ProfileVisitEntry[] }>();
  const entriesWithoutDate: ProfileVisitEntry[] = [];

  for (const entry of sortTimelineEntries(entries)) {
    const timestamp = entryTimestamp(entry);
    if (!Number.isFinite(timestamp)) {
      entriesWithoutDate.push(entry);
      continue;
    }

    const date = new Date(timestamp);
    const dayDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
    const dayKey = formatDayKey(dayDate);
    const existing = groups.get(dayKey);
    if (existing) {
      existing.items.push(entry);
      continue;
    }

    groups.set(dayKey, { date: dayDate, items: [entry] });
  }

  const formatter = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const sortedGroups = [...groups.entries()]
    .sort((left, right) => right[1].date.getTime() - left[1].date.getTime())
    .map(([dayKey, value]) => ({
      dayKey,
      title: formatter.format(value.date),
      items: value.items,
    }));

  if (entriesWithoutDate.length > 0) {
    sortedGroups.push({
      dayKey: 'without-date',
      title: 'Ohne Datum',
      items: entriesWithoutDate,
    });
  }

  return sortedGroups satisfies TimelineDayGroup[];
}
