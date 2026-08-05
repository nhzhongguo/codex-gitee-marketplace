import assert from "node:assert/strict";
import test from "node:test";
import { ConfirmationStore } from "../confirmation.js";

test("a confirmation token is single-use and action-bound", () => {
  const store = new ConfirmationStore();
  const issued = store.issue("create_repository", { name: "demo" });

  assert.deepEqual(store.consume<{ name: string }>(issued.token, "create_repository").payload, { name: "demo" });
  assert.throws(() => store.consume(issued.token, "create_repository"), /invalid, expired, or was already used/);

  const branch = store.issue("create_branch", { name: "feature/login" });
  assert.throws(() => store.consume(branch.token, "create_repository"), /invalid, expired, or was already used/);
});

test("a confirmation token expires", async () => {
  const store = new ConfirmationStore();
  const issued = store.issue("create_repository", { name: "demo" }, 1);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.throws(() => store.consume(issued.token, "create_repository"), /invalid, expired, or was already used/);
});
