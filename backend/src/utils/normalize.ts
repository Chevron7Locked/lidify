export function normalizeToArray(value: any) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
}
