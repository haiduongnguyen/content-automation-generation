import test from "node:test";
import assert from "node:assert/strict";
import { checkQuota } from "../src/services/openAiQuota";

test("checkQuota allows when under request and budget limits", () => {
  const d = checkQuota({
    requestCountToday: 2,
    totalCostTodayUsd: 0.2,
    maxRequestsPerDay: 5,
    dailyBudgetUsd: 1,
    estimatedCostPerRequestUsd: 0.1,
  });
  assert.equal(d.allowed, true);
});

test("checkQuota blocks when request cap reached", () => {
  const d = checkQuota({
    requestCountToday: 5,
    totalCostTodayUsd: 0.2,
    maxRequestsPerDay: 5,
    dailyBudgetUsd: 1,
    estimatedCostPerRequestUsd: 0.1,
  });
  assert.equal(d.allowed, false);
  assert.match(d.reason || "", /request cap/i);
});

test("checkQuota blocks when budget would be exceeded", () => {
  const d = checkQuota({
    requestCountToday: 2,
    totalCostTodayUsd: 0.95,
    maxRequestsPerDay: 5,
    dailyBudgetUsd: 1,
    estimatedCostPerRequestUsd: 0.1,
  });
  assert.equal(d.allowed, false);
  assert.match(d.reason || "", /budget/i);
});
