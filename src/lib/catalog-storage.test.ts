import assert from "node:assert/strict";
import test from "node:test";
import {
  compactCatalog,
  compactText,
  compactUrl,
  hasIdbMarker,
  isCatalogState,
  isIdbMarker,
  isQuotaError,
  loadCatalog,
  persistCatalog,
  writeCatalogLocalMarker,
} from "./catalog-storage.ts";
import type { CatalogState, Edition, TitleRecord } from "./types.ts";

const sampleEdition: Edition = {
  id: "e1",
  channel: "demo",
  channelTitle: "demo",
  messageId: 1,
  postUrl: "https://t.me/demo/1",
  links: [{ kind: "quark", url: "https://pan.quark.cn/s/a" }],
  rawText: "原文".repeat(400),
  photoUrl: "data:image/svg+xml;utf8,x",
};

const sampleTitle: TitleRecord = {
  id: "t1",
  title: "沙丘2",
  type: "movie",
  genres: [],
  cast: [],
  overview: "简介".repeat(500),
  posterUrl: "data:image/svg+xml;utf8,x",
  editions: [sampleEdition],
  firstSeenAt: "2026-01-01T00:00:00.000Z",
  lastSeenAt: "2026-01-01T00:00:00.000Z",
};

const sampleState: CatalogState = {
  version: 1,
  initialized: true,
  noticeDismissed: false,
  channels: [],
  titles: [sampleTitle],
};

test("compactText and compactUrl shrink persisted payload", () => {
  assert.equal(compactUrl("data:image/svg+xml;utf8,abc"), undefined);
  assert.equal(compactUrl("https://cdn.example/p.jpg"), "https://cdn.example/p.jpg");
  const long = "字".repeat(400);
  const clipped = compactText(long, 280);
  assert.ok([...clipped].length <= 281);
  assert.ok(clipped.endsWith("…"));
});

test("compactCatalog drops data-uri posters and long raw text", () => {
  const compact = compactCatalog(sampleState);
  assert.equal(compact.titles[0]?.posterUrl, undefined);
  assert.equal(compact.titles[0]?.editions[0]?.photoUrl, undefined);
  assert.ok(
    (compact.titles[0]?.editions[0]?.rawText.length ?? 0) <
      sampleEdition.rawText.length,
  );
  assert.ok(JSON.stringify(compact).length < JSON.stringify(sampleState).length);
  assert.equal(isCatalogState(compact), true);
  assert.equal(isCatalogState({ version: 1 }), false);
  assert.equal(isIdbMarker({ version: 1, backend: "idb" }), true);
  assert.equal(isIdbMarker(sampleState), false);
});

test("isQuotaError recognizes QuotaExceededError-shaped errors", () => {
  assert.equal(isQuotaError({ name: "QuotaExceededError" }), true);
  assert.equal(isQuotaError({ name: "TypeError" }), false);
  assert.equal(isQuotaError(null), false);
});

test("persistCatalog never throws when IndexedDB and window are missing", async () => {
  const result = await persistCatalog(sampleState);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error, "unavailable");
});

test("loadCatalog reports empty when no browser storage exists", async () => {
  const result = await loadCatalog();
  assert.equal(result.status, "empty");
});

test("localStorage marker replaces a fat catalog blob", () => {
  const store = new Map<string, string>();
  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalStorage = (globalThis as { localStorage?: Storage }).localStorage;

  const mock: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key) {
      return store.get(key) ?? null;
    },
    key(index) {
      return [...store.keys()][index] ?? null;
    },
    removeItem(key) {
      store.delete(key);
    },
    setItem(key, value) {
      store.set(key, value);
    },
  };

  Object.defineProperty(globalThis, "window", {
    value: { localStorage: mock },
    configurable: true,
  });
  Object.defineProperty(globalThis, "localStorage", {
    value: mock,
    configurable: true,
  });

  try {
    mock.setItem("yingqu.catalog.v1", JSON.stringify(sampleState));
    assert.equal(hasIdbMarker(), false);
    writeCatalogLocalMarker();
    assert.equal(hasIdbMarker(), true);
    writeCatalogLocalMarker("sqlite");
    assert.equal(hasIdbMarker(), false);
    const sqliteRaw = mock.getItem("yingqu.catalog.v1") ?? "";
    assert.ok(sqliteRaw.includes("sqlite"));
    const raw = mock.getItem("yingqu.catalog.v1") ?? "";
    assert.ok(raw.length < 80);
    assert.ok(!raw.includes("沙丘2"));
  } finally {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      Object.defineProperty(globalThis, "window", {
        value: originalWindow,
        configurable: true,
      });
    }
    if (originalStorage === undefined) {
      delete (globalThis as { localStorage?: Storage }).localStorage;
    } else {
      Object.defineProperty(globalThis, "localStorage", {
        value: originalStorage,
        configurable: true,
      });
    }
  }
});
