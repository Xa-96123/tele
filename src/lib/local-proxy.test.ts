import assert from "node:assert/strict";
import test from "node:test";
import {
  clientProxyUrl,
  isLoopbackProxy,
  normalizeProxyInput,
} from "./local-proxy.ts";

test("normalizes Clash-style local proxy input", () => {
  assert.equal(normalizeProxyInput("7890"), "http://127.0.0.1:7890");
  assert.equal(normalizeProxyInput("127.0.0.1:7890"), "http://127.0.0.1:7890");
  assert.equal(
    normalizeProxyInput("http://127.0.0.1:7890"),
    "http://127.0.0.1:7890",
  );
  assert.equal(
    normalizeProxyInput("socks5://127.0.0.1:7891"),
    "socks5://127.0.0.1:7891",
  );
  assert.equal(normalizeProxyInput(""), undefined);
  assert.equal(normalizeProxyInput("ftp://127.0.0.1:21"), undefined);
});

test("only allows loopback proxies from the browser", () => {
  assert.equal(isLoopbackProxy("http://127.0.0.1:7890"), true);
  assert.equal(isLoopbackProxy("socks5://localhost:1080"), true);
  assert.equal(clientProxyUrl("http://10.0.0.2:8080"), undefined);
  assert.equal(clientProxyUrl("http://example.com:8080"), undefined);
  assert.equal(clientProxyUrl("7890"), "http://127.0.0.1:7890");
});
