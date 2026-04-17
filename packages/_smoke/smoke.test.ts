import { expect, test } from "bun:test";

test("smoke: bun test runner loads", () => {
  expect(1 + 1).toBe(2);
});
