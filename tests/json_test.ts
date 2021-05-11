import {
    assert,
    assertEquals,
    assertThrows
} from './deps.ts';

import {
    AnyTy,
    JsonParser,
    JsonParseResult,
    JsonSchema,
    parseAs,
    parseAsOrThrow
} from '../mod.ts';

Deno.test("parseAsOrThrow, array, empty array", () => {
    assertEquals(parseAsOrThrow("[]", Array), []);
});

Deno.test("parseAsOrThrow, array, singleton number array", () => {
    assertEquals(parseAsOrThrow("[1]", Array), [1]);
});

Deno.test("parseAsOrThrow, array, mixed element array", () => {
    assertEquals(parseAsOrThrow("[1, true, [5], \"test\"]", Array), [1, true, [5], "test"]);
});

Deno.test("parseAsOrThrow, array, not an array (an object)", () => {
    assertThrows(() => parseAsOrThrow("{}", Array), JsonParser.JsonTypeError);
});

Deno.test("parseAsOrThrow, array of arrays, singleton number nested array", () => {
    assertEquals(parseAsOrThrow("[[1]]", [Array, Array]), [[1]]);
});

Deno.test("parseAsOrThrow, array of booleans, empty array", () => {
    assertEquals(parseAsOrThrow("[]", [Array, Boolean]), []);
});

Deno.test("parseAsOrThrow, array of booleans, singleton boolean array", () => {
    assertEquals(parseAsOrThrow("[true]", [Array, Boolean]), [true]);
});

Deno.test("parseAsOrThrow, array of booleans, not an array (an object)", () => {
    assertThrows(() => parseAsOrThrow("{}", [Array, Boolean]), JsonParser.JsonTypeError);
});

Deno.test("parseAsOrThrow, array of booleans, array of numbers", () => {
    assertThrows(() => parseAsOrThrow("[1]", [Array, Boolean]), JsonParser.JsonTypeError);
});

Deno.test("parseAsOrThrow, boolean, true", () => {
    assertEquals(parseAsOrThrow("true", Boolean), true);
});

Deno.test("parseAsOrThrow, boolean, false", () => {
    assertEquals(parseAsOrThrow("false", Boolean), false);
});

Deno.test("parseAsOrThrow, boolean, not a boolean", () => {
    assertThrows(() => parseAsOrThrow("null", Boolean), JsonParser.JsonTypeError);
});

Deno.test("parseAsOrThrow, number, 7", () => {
    assertEquals(parseAsOrThrow("7", Number), 7);
});

Deno.test("parseAsOrThrow, number, not a number", () => {
    assertThrows(() => parseAsOrThrow("true", Number), JsonParser.JsonTypeError);
});

Deno.test("parseAsOrThrow, null, null", () => {
    assertEquals(parseAsOrThrow("null", null), null);
});

Deno.test("parseAsOrThrow, null, not null", () => {
    assertThrows(() => parseAsOrThrow("true", null), JsonParser.JsonTypeError);
});

Deno.test("parseAsOrThrow, object, empty object", () => {
    assertEquals(parseAsOrThrow("{}", Object), {});
});

Deno.test("parseAsOrThrow, object, singleton number object", () => {
    assertEquals(parseAsOrThrow(`{"k": 1}`, Object), { k: 1 });
});

Deno.test("parseAsOrThrow, object, mixed element object", () => {
    assertEquals(parseAsOrThrow(`{"k1": 1, "k2": true, "k3": {"k31": [7]}, "k4": \"test\"}`, Object), { k1: 1, k2: true, k3: { k31: [7] }, k4: "test" });
});

Deno.test("parseAsOrThrow, object, not an object (an array)", () => {
    assertThrows(() => parseAsOrThrow("[]", Object), JsonParser.JsonTypeError);
});

Deno.test("parseAsOrThrow, object of objects, singleton number nested object", () => {
    assertEquals(parseAsOrThrow(`{"k": {"k2": 1}}`, [Object, Object]), { k: { k2: 1 } });
});

Deno.test("parseAsOrThrow, object of booleans, empty object", () => {
    assertEquals(parseAsOrThrow("{}", [Object, Boolean]), {});
});

Deno.test("parseAsOrThrow, object of booleans, singleton boolean object", () => {
    assertEquals(parseAsOrThrow(`{"k": true}`, [Object, Boolean]), { k: true });
});

Deno.test("parseAsOrThrow, object of booleans, not an object (an array)", () => {
    assertThrows(() => parseAsOrThrow("[]", [Object, Boolean]), JsonParser.JsonTypeError);
});

Deno.test("parseAsOrThrow, object of booleans, object of numbers", () => {
    assertThrows(() => parseAsOrThrow(`{"k": 1}`, [Object, Boolean]), JsonParser.JsonTypeError);
});

Deno.test("parseAsOrThrow, string, empty string", () => {
    assertEquals(parseAsOrThrow("\"\"", String), "");
});

Deno.test("parseAsOrThrow, string, nonempty string", () => {
    assertEquals(parseAsOrThrow("\"test\"", String), "test");
});

Deno.test("parseAsOrThrow, string, string with quotes", () => {
    assertEquals(parseAsOrThrow("\"t\\\"es\\\"t\"", String), "t\"es\"t");
});

Deno.test("parseAsOrThrow, string, not a string", () => {
    assertThrows(() => parseAsOrThrow("true", String), JsonParser.JsonTypeError);
});

Deno.test("parseAsOrThrow, string, a string", () => {
    assertEquals(parseAsOrThrow("\"test\"", String), "test");
});

Deno.test("parseAsOrThrow, string, not a string", () => {
    assertThrows(() => parseAsOrThrow("true", String), JsonParser.JsonTypeError);
});

Deno.test("parseAsOrThrow, AnyTy, empty array", () => {
    assertEquals(parseAsOrThrow("[]", AnyTy), []);
});

Deno.test("parseAsOrThrow, AnyTy, singleton number array", () => {
    assertEquals(parseAsOrThrow("[1]", AnyTy), [1]);
});

Deno.test("parseAsOrThrow, AnyTy, number", () => {
    assertEquals(parseAsOrThrow("1", AnyTy), 1);
});

Deno.test("parseAsOrThrow, AnyTy, boolean", () => {
    assertEquals(parseAsOrThrow("true", AnyTy), true);
});

class Basic {
    p: boolean;

    constructor(p: boolean) {
        this.p = p;
    }
}

const basicSchema = JsonSchema.objectSchema<Basic>('Basic', {
    'p': Boolean
}, (o) => {
    return new Basic(o.get('p'));
});

const basicSchemas = new Map();

basicSchemas.set(Basic, basicSchema);

Deno.test("parseAsOrThrow, with schema, Basic, ok", () => {
    assertEquals(parseAsOrThrow(`{"p": true}`, Basic, basicSchemas), new Basic(true));
});

Deno.test("parseAsOrThrow, with schema, Basic, missing key", () => {
    assertThrows(() => parseAsOrThrow(`{}`, Basic, basicSchemas), JsonParser.MissingKeysError, "missing keys: p");
});

Deno.test("parseAsOrThrow, with schema, Basic, extra key", () => {
    assertThrows(() => parseAsOrThrow(`{"p": true, "q": 1}`, Basic, basicSchemas), JsonParser.UnknownKeysError, "unknown keys: q");
});

Deno.test("parseAsOrThrow, with schema, Basic, not on an object", () => {
    assertThrows(() => parseAsOrThrow('7', Basic, basicSchemas), JsonParser.JsonTypeError);
});

class Basic2 {
    p: Basic;

    constructor(p: Basic) {
        this.p = p;
    }
}

const basic2Schema = JsonSchema.objectSchema<Basic2>('Basic2', {
    p: Basic,
}, (o) => { return new Basic2(o.get('p')); });

const basic2SchemaMap = new Map();
basic2SchemaMap.set(Basic, basicSchema);
basic2SchemaMap.set(Basic2, basic2Schema);

Deno.test("parseAsOrThrow, with schema, Basic2, inner item does not match Basic, is empty", () => {
    assertThrows(() => parseAsOrThrow(`
{
  "p": {
  }
}`, Basic2, basic2SchemaMap), JsonParser.MissingKeysError, "missing keys: p");
});

Deno.test("parseAsOrThrow, with schema, Basic2, inner item does not match Basic, wrong type", () => {
    assertThrows(() => parseAsOrThrow(`
{
  "p": {
    "p": 1
  }
}`, Basic2, basic2SchemaMap), JsonParser.JsonTypeError, "expected: boolean");
});

Deno.test("parseAsOrThrow, with schema, Basic2, ok", () => {
    assertEquals(parseAsOrThrow(`
{
  "p": {
    "p": true
  }
}`, Basic2, basic2SchemaMap), new Basic2(new Basic(true)))
});


//////////////////////////////
///// Testing Exceptions /////
//////////////////////////////


function assertParseFailsWithClass(actual: JsonParseResult<any>, expectedClass: any): void {
    assert(actual.isLeft(), "expected the parse to fail but it didn't");
    assertEquals(actual.unwrapLeft().constructor, expectedClass);
}

function assertParseFailsWith(actual: JsonParseResult<any>, expected: Error): void {
    assertParseFailsWithClass(actual, expected.constructor);
    assertEquals(actual.unwrapLeft(), expected);
}

Deno.test("errors, type error, expected boolean but got number, correct error", () => {
    assertParseFailsWith(parseAs('1', Boolean), new JsonParser.JsonTypeError('boolean', 1))
});

class Empty { }

Deno.test("errors, type error, expected Empty but got number, correct error", () => {
    assertParseFailsWith(parseAs(`1`, Empty, new Map().set(Empty, JsonSchema.objectSchema<Empty>('Empty', {
    }, (_) => new Empty()))), new JsonParser.JsonTypeError('Empty', 1))
});

Deno.test("errors, type error, wrong field type, expected boolean but got number, correct error", () => {
    assertParseFailsWith(parseAs(`
{
  "p": 1
}`, [Object, Boolean]), new JsonParser.JsonTypeError('boolean', 1))
});

Deno.test("errors, missing keys", () => {
    assertParseFailsWith(parseAs(`
{
  "p2": 1
}`, Empty, new Map().set(Empty, JsonSchema.objectSchema<Empty>('missing keys test', {
        p1: Boolean,
        p2: Number,
        p3: null
    }, (_) => new Empty()))), new JsonParser.MissingKeysError(['p1', 'p3']))
});

Deno.test("errors, unknown keys", () => {
    assertParseFailsWith(parseAs(`
{
  "p1": true,
  "p2": 1,
  "p3": null
}`, Empty, new Map().set(Empty, JsonSchema.objectSchema<Empty>('unknown keys test', {
        p2: Number,
    }, (_) => new Empty()))), new JsonParser.UnknownKeysError(['p1', 'p3']))
});
