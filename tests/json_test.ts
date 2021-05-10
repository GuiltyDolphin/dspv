import {
    assertEquals,
    assertThrows
} from './deps.ts';

import {
    parseAs,
    AnyTy
} from '../mod.ts';

Deno.test("parseAs, array, empty array", () => {
    assertEquals(parseAs("[]", Array), []);
});

Deno.test("parseAs, array, singleton number array", () => {
    assertEquals(parseAs("[1]", Array), [1]);
});

Deno.test("parseAs, array, mixed element array", () => {
    assertEquals(parseAs("[1, true, [5], \"test\"]", Array), [1, true, [5], "test"]);
});

Deno.test("parseAs, array, not an array (an object)", () => {
    assertThrows(() => parseAs("{}", Array), Error);
});

Deno.test("parseAs, array of booleans, empty array", () => {
    assertEquals(parseAs("[]", [Array, Boolean]), []);
});

Deno.test("parseAs, array of booleans, singleton boolean array", () => {
    assertEquals(parseAs("[true]", [Array, Boolean]), [true]);
});

Deno.test("parseAs, array of booleans, not an array (an object)", () => {
    assertThrows(() => parseAs("{}", [Array, Boolean]), Error);
});

Deno.test("parseAs, array of booleans, array of numbers", () => {
    assertThrows(() => parseAs("[1]", [Array, Boolean]), Error);
});

Deno.test("parseAs, boolean, true", () => {
    assertEquals(parseAs("true", Boolean), true);
});

Deno.test("parseAs, boolean, false", () => {
    assertEquals(parseAs("false", Boolean), false);
});

Deno.test("parseAs, boolean, not a boolean", () => {
    assertThrows(() => parseAs("null", Boolean), Error);
});

Deno.test("parseAs, number, 7", () => {
    assertEquals(parseAs("7", Number), 7);
});

Deno.test("parseAs, number, not a number", () => {
    assertThrows(() => parseAs("true", Number), Error);
});

Deno.test("parseAs, null, null", () => {
    assertEquals(parseAs("null", null), null);
});

Deno.test("parseAs, null, not null", () => {
    assertThrows(() => parseAs("true", null), Error);
});

Deno.test("parseAs, string, empty string", () => {
    assertEquals(parseAs("\"\"", String), "");
});

Deno.test("parseAs, string, nonempty string", () => {
    assertEquals(parseAs("\"test\"", String), "test");
});

Deno.test("parseAs, string, string with quotes", () => {
    assertEquals(parseAs("\"t\\\"es\\\"t\"", String), "t\"es\"t");
});

Deno.test("parseAs, string, not a string", () => {
    assertThrows(() => parseAs("true", String), Error);
});

Deno.test("parseAs, string, a string", () => {
    assertEquals(parseAs("\"test\"", String), "test");
});

Deno.test("parseAs, string, not a string", () => {
    assertThrows(() => parseAs("true", String), Error);
});

Deno.test("parseAs, AnyTy, empty array", () => {
    assertEquals(parseAs("[]", AnyTy), []);
});

Deno.test("parseAs, AnyTy, singleton number array", () => {
    assertEquals(parseAs("[1]", AnyTy), [1]);
});

Deno.test("parseAs, AnyTy, number", () => {
    assertEquals(parseAs("1", AnyTy), 1);
});

Deno.test("parseAs, AnyTy, boolean", () => {
    assertEquals(parseAs("true", AnyTy), true);
});
