export async function loadAllCandidatePages<T>(
  loadPage: (current: number) => Promise<API.PaginatedResult<T>>,
) {
  const items: T[] = [];
  let current = 1;
  let total = 0;
  do {
    const page = await loadPage(current);
    items.push(...page.data);
    total = page.total;
    current += 1;
    if (page.data.length === 0) break;
  } while (items.length < total);
  return items;
}
