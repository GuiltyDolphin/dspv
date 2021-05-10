import {
    assertEquals,
    assertThrows
} from './deps.ts';

import {
    parseAs
} from '../mod.ts';

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
