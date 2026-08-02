import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the finished family outing service", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /오늘, 아들과/);
  assert.match(html, /초4 맞춤 서울 나들이 레이더/);
  assert.match(html, /오늘의 모험/);
  assert.match(html, /실시간 연결 중/);
  assert.match(html, /hero-father-son\.jpg/);
  assert.match(html, /og\.png/);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview|SkeletonPreview/);
});

test("ships the curated product data and social card", async () => {
  const [page, places, layout] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/places.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /MapPanel/);
  assert.match(page, /TODAY&apos;S MISSION/);
  assert.match(page, /\/api\/geocode/);
  assert.match(places, /서울어린이대공원/);
  assert.match(places, /국립중앙박물관·용산가족공원/);
  assert.match(layout, /generateMetadata/);
  await access(new URL("../public/og.png", import.meta.url));
  await access(new URL("../public/hero-father-son.jpg", import.meta.url));
  assert.deepEqual(
    await readdir(new URL("../app/_sites-preview", import.meta.url)),
    [],
  );
});
