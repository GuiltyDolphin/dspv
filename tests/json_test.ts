import {
    assert,
    assertEquals,
    assertThrows
} from './deps.ts';

import {
    AnyTy,
    JsonParser,
    JsonParseResult,
    JsonSchema
} from '../mod.ts';

const basicParser = new JsonParser();

Deno.test("parseAsOrThrow, array, empty array", () => {
    assertEquals(basicParser.parseAsOrThrow("[]", Array), []);
});

Deno.test("parseAsOrThrow, array, singleton number array", () => {
    assertEquals(basicParser.parseAsOrThrow("[1]", Array), [1]);
});

Deno.test("parseAsOrThrow, array, mixed element array", () => {
    assertEquals(basicParser.parseAsOrThrow("[1, true, [5], \"test\"]", Array), [1, true, [5], "test"]);
});

Deno.test("parseAsOrThrow, array, not an array (an object)", () => {
    assertThrows(() => basicParser.parseAsOrThrow("{}", Array), JsonParser.JsonTypeError);
});

Deno.test("parseAsOrThrow, array of arrays, singleton number nested array", () => {
    assertEquals(basicParser.parseAsOrThrow("[[1]]", [Array, Array]), [[1]]);
});

Deno.test("parseAsOrThrow, array of booleans, empty array", () => {
    assertEquals(basicParser.parseAsOrThrow("[]", [Array, Boolean]), []);
});

Deno.test("parseAsOrThrow, array of booleans, singleton boolean array", () => {
    assertEquals(basicParser.parseAsOrThrow("[true]", [Array, Boolean]), [true]);
});

Deno.test("parseAsOrThrow, array of booleans, not an array (an object)", () => {
    assertThrows(() => basicParser.parseAsOrThrow("{}", [Array, Boolean]), JsonParser.JsonTypeError);
});

Deno.test("parseAsOrThrow, array of booleans, array of numbers", () => {
    assertThrows(() => basicParser.parseAsOrThrow("[1]", [Array, Boolean]), JsonParser.JsonTypeError);
});

Deno.test("parseAsOrThrow, boolean, true", () => {
    assertEquals(basicParser.parseAsOrThrow("true", Boolean), true);
});

Deno.test("parseAsOrThrow, boolean, false", () => {
    assertEquals(basicParser.parseAsOrThrow("false", Boolean), false);
});

Deno.test("parseAsOrThrow, boolean, not a boolean", () => {
    assertThrows(() => basicParser.parseAsOrThrow("null", Boolean), JsonParser.JsonTypeError);
});

Deno.test("parseAsOrThrow, number, 7", () => {
    assertEquals(basicParser.parseAsOrThrow("7", Number), 7);
});

Deno.test("parseAsOrThrow, number, not a number", () => {
    assertThrows(() => basicParser.parseAsOrThrow("true", Number), JsonParser.JsonTypeError);
});

Deno.test("parseAsOrThrow, null, null", () => {
    assertEquals(basicParser.parseAsOrThrow("null", null), null);
});

Deno.test("parseAsOrThrow, null, not null", () => {
    assertThrows(() => basicParser.parseAsOrThrow("true", null), JsonParser.JsonTypeError);
});

Deno.test("parseAsOrThrow, object, empty object", () => {
    assertEquals(basicParser.parseAsOrThrow("{}", Object), {});
});

Deno.test("parseAsOrThrow, object, singleton number object", () => {
    assertEquals(basicParser.parseAsOrThrow(`{"k": 1}`, Object), { k: 1 });
});

Deno.test("parseAsOrThrow, object, mixed element object", () => {
    assertEquals(basicParser.parseAsOrThrow(`{"k1": 1, "k2": true, "k3": {"k31": [7]}, "k4": \"test\"}`, Object), { k1: 1, k2: true, k3: { k31: [7] }, k4: "test" });
});

Deno.test("parseAsOrThrow, object, not an object (an array)", () => {
    assertThrows(() => basicParser.parseAsOrThrow("[]", Object), JsonParser.JsonTypeError);
});

Deno.test("parseAsOrThrow, object of objects, singleton number nested object", () => {
    assertEquals(basicParser.parseAsOrThrow(`{"k": {"k2": 1}}`, [Object, Object]), { k: { k2: 1 } });
});

Deno.test("parseAsOrThrow, object of booleans, empty object", () => {
    assertEquals(basicParser.parseAsOrThrow("{}", [Object, Boolean]), {});
});

Deno.test("parseAsOrThrow, object of booleans, singleton boolean object", () => {
    assertEquals(basicParser.parseAsOrThrow(`{"k": true}`, [Object, Boolean]), { k: true });
});

Deno.test("parseAsOrThrow, object of booleans, not an object (an array)", () => {
    assertThrows(() => basicParser.parseAsOrThrow("[]", [Object, Boolean]), JsonParser.JsonTypeError);
});

Deno.test("parseAsOrThrow, object of booleans, object of numbers", () => {
    assertThrows(() => basicParser.parseAsOrThrow(`{"k": 1}`, [Object, Boolean]), JsonParser.JsonTypeError);
});

Deno.test("parseAsOrThrow, string, empty string", () => {
    assertEquals(basicParser.parseAsOrThrow("\"\"", String), "");
});

Deno.test("parseAsOrThrow, string, nonempty string", () => {
    assertEquals(basicParser.parseAsOrThrow("\"test\"", String), "test");
});

Deno.test("parseAsOrThrow, string, string with quotes", () => {
    assertEquals(basicParser.parseAsOrThrow("\"t\\\"es\\\"t\"", String), "t\"es\"t");
});

Deno.test("parseAsOrThrow, string, not a string", () => {
    assertThrows(() => basicParser.parseAsOrThrow("true", String), JsonParser.JsonTypeError);
});

Deno.test("parseAsOrThrow, string, a string", () => {
    assertEquals(basicParser.parseAsOrThrow("\"test\"", String), "test");
});

Deno.test("parseAsOrThrow, string, not a string", () => {
    assertThrows(() => basicParser.parseAsOrThrow("true", String), JsonParser.JsonTypeError);
});

Deno.test("parseAsOrThrow, AnyTy, empty array", () => {
    assertEquals(basicParser.parseAsOrThrow("[]", AnyTy), []);
});

Deno.test("parseAsOrThrow, AnyTy, singleton number array", () => {
    assertEquals(basicParser.parseAsOrThrow("[1]", AnyTy), [1]);
});

Deno.test("parseAsOrThrow, AnyTy, number", () => {
    assertEquals(basicParser.parseAsOrThrow("1", AnyTy), 1);
});

Deno.test("parseAsOrThrow, AnyTy, boolean", () => {
    assertEquals(basicParser.parseAsOrThrow("true", AnyTy), true);
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

const parserBasic = new JsonParser(basicSchemas);

Deno.test("parseAsOrThrow, with schema, Basic, ok", () => {
    assertEquals(parserBasic.parseAsOrThrow(`{"p": true}`, Basic), new Basic(true));
});

Deno.test("parseAsOrThrow, with schema, Basic, missing key", () => {
    assertThrows(() => parserBasic.parseAsOrThrow(`{}`, Basic), JsonParser.MissingKeysError, "missing keys: p");
});

Deno.test("parseAsOrThrow, with schema, Basic, extra key", () => {
    assertThrows(() => parserBasic.parseAsOrThrow(`{"p": true, "q": 1}`, Basic), JsonParser.UnknownKeysError, "unknown keys: q");
});

Deno.test("parseAsOrThrow, with schema, Basic, not on an object", () => {
    assertThrows(() => parserBasic.parseAsOrThrow('7', Basic), JsonParser.JsonTypeError);
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

const basic2Parser = new JsonParser(basic2SchemaMap);

Deno.test("parseAsOrThrow, with schema, Basic2, inner item does not match Basic, is empty", () => {
    assertThrows(() => basic2Parser.parseAsOrThrow(`
{
  "p": {
  }
}`, Basic2), JsonParser.MissingKeysError, "missing keys: p");
});

Deno.test("parseAsOrThrow, with schema, Basic2, inner item does not match Basic, wrong type", () => {
    assertThrows(() => basic2Parser.parseAsOrThrow(`
{
  "p": {
    "p": 1
  }
}`, Basic2), JsonParser.JsonTypeError, "expected: boolean");
});

Deno.test("parseAsOrThrow, with schema, Basic2, ok", () => {
    assertEquals(basic2Parser.parseAsOrThrow(`
{
  "p": {
    "p": true
  }
}`, Basic2), new Basic2(new Basic(true)))
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
    assertParseFailsWith(basicParser.parseAs('1', Boolean), new JsonParser.JsonTypeError('boolean', 1))
});

class Empty { }

Deno.test("errors, type error, expected Empty but got number, correct error", () => {
    assertParseFailsWith(new JsonParser(new Map().set(Empty, JsonSchema.objectSchema<Empty>('Empty', {
    }, (_) => new Empty()))).parseAs(`1`, Empty), new JsonParser.JsonTypeError('Empty', 1))
});

Deno.test("errors, type error, wrong field type, expected boolean but got number, correct error", () => {
    assertParseFailsWith(basicParser.parseAs(`
{
  "p": 1
}`, [Object, Boolean]), new JsonParser.JsonTypeError('boolean', 1))
});

Deno.test("errors, missing keys", () => {
    assertParseFailsWith(
        new JsonParser(new Map().set(Empty, JsonSchema.objectSchema<Empty>('missing keys test', {
            p1: Boolean,
            p2: Number,
            p3: null
        }, (_) => new Empty()))).parseAs(`
{
  "p2": 1
}`, Empty), new JsonParser.MissingKeysError(['p1', 'p3']))
});

Deno.test("errors, unknown keys", () => {
    assertParseFailsWith(
        new JsonParser(new Map().set(Empty, JsonSchema.objectSchema<Empty>('unknown keys test', {
            p2: Number,
        }, (_) => new Empty()))).parseAs(`
{
  "p1": true,
  "p2": 1,
  "p3": null
}`, Empty), new JsonParser.UnknownKeysError(['p1', 'p3']))
});
});
