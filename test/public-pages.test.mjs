import assert from "node:assert/strict";
import test from "node:test";

const base = process.env.PUBLIC_SITE_TEST_URL;
const pages = [
  ["/", "GrowdoAds"],
  ["/privacy", "개인정보처리방침"],
  ["/terms", "이용약관"],
  ["/data-deletion", "데이터 삭제 요청"],
];

for (const [path, heading] of pages) {
  test(
    `${path} is public without authentication or backend access`,
    { skip: !base },
    async () => {
      const response = await fetch(new URL(path, base), { redirect: "manual" });
      assert.equal(response.status, 200);
      const html = await response.text();
      assert.match(html, new RegExp(`<h1[^>]*>${heading}</h1>`));
      for (const [link] of pages)
        assert.ok(
          html.includes(`href="${link}"`),
          `Missing public navigation to ${link}`,
        );
      assert.match(html, /mailto:okpc0305@gmail.com/);
      assert.ok(!response.headers.has("set-cookie"));
    },
  );
}

test(
  "invalid auth cookies do not hide the public homepage",
  { skip: !base },
  async () => {
    const response = await fetch(new URL("/", base), {
      redirect: "manual",
      headers: { Cookie: "access_token=invalid; refresh_token=invalid" },
    });
    assert.equal(response.status, 200);
    assert.match(await response.text(), /href="\/privacy"/);
  },
);

test("private dashboard is still protected", { skip: !base }, async () => {
  const response = await fetch(new URL("/dashboard", base), {
    redirect: "manual",
  });
  assert.ok([307, 308].includes(response.status));
  assert.equal(
    new URL(response.headers.get("location"), base).pathname,
    "/login",
  );
});

test(
  "sitemap and robots expose public URLs, not account pages",
  { skip: !base },
  async () => {
    const sitemap = await fetch(new URL("/sitemap.xml", base));
    assert.equal(sitemap.status, 200);
    const xml = await sitemap.text();
    assert.match(xml, /\/privacy<\/loc>/);
    assert.doesNotMatch(xml, /\/dashboard|\/workspaces/);
    const robots = await fetch(new URL("/robots.txt", base));
    assert.equal(robots.status, 200);
    assert.match(await robots.text(), /Disallow: \/api\//);
  },
);
