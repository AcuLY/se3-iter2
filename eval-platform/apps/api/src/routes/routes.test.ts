import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import Database from "better-sqlite3";
import { setDbForTests, closeDb } from "../db/index.js";
import { buildApp } from "../server.js";

let app: ReturnType<typeof buildApp>;

beforeEach(() => {
  setDbForTests(new Database(":memory:"));
  app = buildApp();
});
afterEach(() => closeDb());

describe("agents CRUD", () => {
  it("creates and lists an agent", async () => {
    const create = await request(app).post("/api/agents").send({
      name: "Travel Agent",
      version: "0.1.0",
      endpoint: "http://localhost:8088/v1/run",
    });
    expect(create.status).toBe(201);
    expect(create.body.id).toMatch(/^ag_/);

    const list = await request(app).get("/api/agents");
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].endpoint).toBe("http://localhost:8088/v1/run");
  });

  it("rejects invalid endpoint URL", async () => {
    const r = await request(app).post("/api/agents").send({
      name: "x", version: "0", endpoint: "not-a-url",
    });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("validation_error");
  });
});

describe("datasets and items", () => {
  it("creates dataset and bulk-uploads items", async () => {
    const ds = await request(app).post("/api/datasets")
      .send({ name: "demo" });
    expect(ds.status).toBe(201);
    const id = ds.body.id;

    const bulk = await request(app)
      .post(`/api/datasets/${id}/items:bulk`)
      .send({
        items: [
          { input: "北京 2 天", reference: '{"success_keywords":["北京"]}' },
          { input: "杭州 3 天" },
        ],
      });
    expect(bulk.status).toBe(201);
    expect(bulk.body.created).toBe(2);

    const items = await request(app).get(`/api/datasets/${id}/items`);
    expect(items.status).toBe(200);
    expect(items.body).toHaveLength(2);
  });
});

describe("metrics", () => {
  it("seeds builtin metrics", async () => {
    const r = await request(app).get("/api/metrics");
    expect(r.status).toBe(200);
    const keys = r.body.map((m: any) => m.key);
    expect(keys).toContain("token_cost");
    expect(keys).toContain("ragas.faithfulness");
  });

  it("rejects deleting a builtin metric", async () => {
    const list = await request(app).get("/api/metrics");
    const builtin = list.body.find((m: any) => m.isBuiltin);
    const del = await request(app).delete(`/api/metrics/${builtin.id}`);
    expect(del.status).toBe(400);
  });

  it("creates a custom metric and namespaces its key", async () => {
    const r = await request(app).post("/api/metrics").send({
      key: "my_judge",
      name: "我的判分器",
      category: "result",
      mode: "fuzzy",
      dimension: "quality",
      config: { kind: "llm_judge", prompt: "Rate 0..1" },
    });
    expect(r.status).toBe(201);
    expect(r.body.key).toBe("custom.my_judge");
    expect(r.body.isBuiltin).toBe(false);
  });
});
