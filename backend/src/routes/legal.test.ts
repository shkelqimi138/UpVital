// Tests for the legacy /privacy and /terms API URLs (legal.ts): they must redirect to the website,
// which holds the only copy of the text. Runs the router on an ephemeral port — no extra packages.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import legalRouter from "./legal";

describe("legal redirects", () => {
  let server: Server;
  let base: string;

  before(async () => {
    const app = express();
    app.use(legalRouter);
    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  for (const [path, target] of [
    ["/privacy", "https://upvital.app/privacy"],
    ["/terms", "https://upvital.app/terms"],
  ]) {
    it(`${path} permanently redirects to ${target}`, async () => {
      const res = await fetch(`${base}${path}`, { redirect: "manual" });
      assert.equal(res.status, 301);
      assert.equal(res.headers.get("location"), target);
    });
  }
});
