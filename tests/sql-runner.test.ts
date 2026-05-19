import test from "node:test";
import assert from "node:assert/strict";
import { compileNamedQuery } from "../src/db/sqlRunner";

test("compileNamedQuery maps named params to positional and reuses same key index", () => {
  const sql = "select * from t where a=:a and b=:b and a2=:a";
  const compiled = compileNamedQuery(sql, { a: 10, b: "x" });
  assert.equal(compiled.text, "select * from t where a=$1 and b=$2 and a2=$1");
  assert.deepEqual(compiled.values, [10, "x"]);
});

test("compileNamedQuery ignores postgres cast syntax ::TYPE", () => {
  const sql = "select COUNT(*)::INT as c where d=:d";
  const compiled = compileNamedQuery(sql, { d: "2026-05-07" });
  assert.equal(compiled.text, "select COUNT(*)::INT as c where d=$1");
  assert.deepEqual(compiled.values, ["2026-05-07"]);
});

test("compileNamedQuery throws on missing param", () => {
  assert.throws(() => compileNamedQuery("select :missing", {}), /Missing SQL param/);
});
