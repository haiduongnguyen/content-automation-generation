import assert from "node:assert/strict";
import test from "node:test";
import { getAdminHost, getAdminPort } from "../src/scripts/adminServer";
import { isAdminRequestAuthorized } from "../src/server/adminApp";

test("admin server defaults to local bind", () => {
  const previous = { ...process.env };
  delete process.env.ADMIN_HOST;
  delete process.env.ADMIN_PORT;
  try {
    assert.equal(getAdminHost(), "127.0.0.1");
    assert.equal(getAdminPort(), 3000);
  } finally {
    process.env = previous;
  }
});

test("admin server rejects invalid ports", () => {
  const previous = { ...process.env };
  process.env.ADMIN_PORT = "70000";
  try {
    assert.throws(() => getAdminPort(), /Invalid ADMIN_PORT/);
  } finally {
    process.env = previous;
  }
});

test("admin auth allows all requests when disabled", () => {
  const previous = { ...process.env };
  process.env.ADMIN_AUTH_ENABLED = "false";
  delete process.env.ADMIN_TOKEN;
  try {
    assert.equal(isAdminRequestAuthorized({ headers: {} }), true);
  } finally {
    process.env = previous;
  }
});

test("admin auth accepts bearer token when enabled", () => {
  const previous = { ...process.env };
  process.env.ADMIN_AUTH_ENABLED = "true";
  process.env.ADMIN_TOKEN = "secret-token";
  try {
    assert.equal(isAdminRequestAuthorized({ headers: { authorization: "Bearer secret-token" } }), true);
    assert.equal(isAdminRequestAuthorized({ headers: { authorization: "Bearer wrong-token" } }), false);
  } finally {
    process.env = previous;
  }
});

test("admin auth accepts token cookie when enabled", () => {
  const previous = { ...process.env };
  process.env.ADMIN_AUTH_ENABLED = "true";
  process.env.ADMIN_TOKEN = "secret-token";
  try {
    assert.equal(isAdminRequestAuthorized({ headers: { cookie: "admin_token=secret-token" } }), true);
    assert.equal(isAdminRequestAuthorized({ headers: { cookie: "admin_token=wrong-token" } }), false);
  } finally {
    process.env = previous;
  }
});
