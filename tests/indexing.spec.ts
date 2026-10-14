import { expect, test } from "@playwright/test";

const publicRoutes = ["/"];
const recordRoutes: string[] = [];

function hasNoindexRobots(html: string) {
  return (html.match(/<meta\b[^>]*>/gi) ?? []).some((tag) =>
    /\sname\s*=\s*(?:"robots"|'robots'|robots(?=\s|\/?>))/i.test(tag) &&
    /\scontent\s*=\s*(?:"[^"]*noindex[^"]*"|'[^']*noindex[^']*'|[^\s"'=<>`]*noindex[^\s"'=<>`]*)/i.test(tag)
  );
}

for (const route of publicRoutes) {
  test(`${route} is public and indexable`, async ({ request }) => {
    const response = await request.get(route, { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(response.headers()["x-robots-tag"] ?? "").not.toMatch(/noindex/i);
    expect(hasNoindexRobots(await response.text())).toBe(false);
  });
}

for (const route of recordRoutes) {
  test(`${route} keeps saved data out of search`, async ({ request }) => {
    const response = await request.get(route, { maxRedirects: 0 });
    expect(response.status()).toBe(200);
    expect(hasNoindexRobots(await response.text())).toBe(true);
  });
}
