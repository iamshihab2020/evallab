const DATE_TIME_FMT = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatDateTime(iso: string): string {
  try {
    return DATE_TIME_FMT.format(new Date(iso));
  } catch {
    return iso;
  }
}
