import {
    assert,
    assertEquals,
    assertThrows,
    Test,
    testGroup,
} from './deps.ts';

import {
    AnyTy,
    JsonParser,
    JsonSchema,
    Schemas,
    TySpec,
} from '../mod.ts';

const basicParser = new JsonParser();

function testParseAsOrThrowWithParser(parser: JsonParser, innerDesc: string, toParse: string, ty: TySpec, expected: unknown): Test {
    return new Test(innerDesc, () => {
        assertEquals(parser.parseAsOrThrow(toParse, ty), expected);
    });
}

function testParseAsOrThrowFailsWithParser(parser: JsonParser, innerDesc: string, toParse: string, ty: TySpec, errTy: { new(...args: any[]): any }, msgIncludes?: string): Test {
    return new Test(innerDesc, () => {
        assertThrows(() => parser.parseAsOrThrow(toParse, ty), errTy, msgIncludes);
    });
}

function testParseAsOrThrow(innerDesc: string, toParse: string, ty: TySpec, expected: any): Test {
    return testParseAsOrThrowWithParser(basicParser, innerDesc, toParse, ty, expected);
}

function testParseAsOrThrowFails(innerDesc: string, toParse: string, ty: TySpec, errTy: { new(...args: any[]): any }, msgIncludes?: string): Test {
    return testParseAsOrThrowFailsWithParser(basicParser, innerDesc, toParse, ty, errTy, msgIncludes);
}

function testParseAsOrThrowFailsWithTypeError(innerDesc: string, toParse: string, ty: TySpec, msgIncludes?: string): Test {
    return testParseAsOrThrowFailsWithParser(basicParser, innerDesc, toParse, ty, JsonParser.JsonTypeError, msgIncludes);
}

testGroup("parseAsOrThrow",
    testGroup("array",
        testParseAsOrThrow("empty array", "[]", Array, []),
        testParseAsOrThrow("singleton number array", "[1]", Array, [1]),
        testParseAsOrThrow("mixed element array", "[1, true, [5], \"test\"]", Array, [1, true, [5], "test"]),
        testParseAsOrThrowFailsWithTypeError("not an array (an object)", "{}", Array),
    ),

    testGroup("array of arrays",
        testParseAsOrThrow("singleton number nested array", "[[1]]", [Array, Array], [[1]]),
    ),

    testGroup("array of booleans",
        testParseAsOrThrow("empty array", "[]", [Array, Boolean], []),
        testParseAsOrThrow("singleton boolean array", "[true]", [Array, Boolean], [true]),
        testParseAsOrThrowFailsWithTypeError("not an array (an object)", "{}", [Array, Boolean]),
        testParseAsOrThrowFailsWithTypeError("array of numbers", "[1]", [Array, Boolean]),
    ),

    testGroup("boolean",
        testParseAsOrThrow("true", "true", Boolean, true),
        testParseAsOrThrow("false", "false", Boolean, false),
        testParseAsOrThrowFailsWithTypeError("not a boolean", "null", Boolean),
    ),

    testGroup("Map",
        testParseAsOrThrow('empty map', '{}', Map, new Map()),
        testParseAsOrThrow('nonempty map', '{"k": 7}', Map, new Map([['k', 7]])),
        testParseAsOrThrow('map with string keys', '{"k": true}', [Map, String], new Map([['k', true]])),
        testParseAsOrThrow('map with boolean values', '{"k": true}', [Map, String, Boolean], new Map([['k', true]])),
        testParseAsOrThrowFailsWithTypeError('map with boolean values, but with a number', '{"k": 1}', [Map, String, Boolean]),
        testParseAsOrThrowFails('map with boolean keys', '{"k": 1}', [Map, Boolean], JsonParser.UnknownSpecError),
        testParseAsOrThrowFails('map with boolean keys and boolean values', '{"k": 1}', [Map, Boolean, Boolean], JsonParser.UnknownSpecError),
    ),

    testGroup("number",
        testParseAsOrThrow("7", "7", Number, 7),
        testParseAsOrThrowFailsWithTypeError("not a number", "true", Number),
    ),

    testGroup("null",
        testParseAsOrThrow("null", "null", null, null),
        testParseAsOrThrowFailsWithTypeError("not null", "true", null),
    ),

    testGroup("object",
        testParseAsOrThrow("empty object", "{}", Object, {}),
        testParseAsOrThrow("singleton number object", `{ "k": 1 }`, Object, { k: 1 }),
        testParseAsOrThrow("mixed element object", `{"k1": 1, "k2": true, "k3": { "k31": [7] }, "k4": \"test\"}`, Object, { k1: 1, k2: true, k3: { k31: [7] }, k4: "test" }),
        testParseAsOrThrowFailsWithTypeError("not an object (an array)", "[]", Object),
    ),

    testGroup("object of objects",
        testParseAsOrThrow("singleton number nested object", `{"k": {"k2": 1}}`, [Object, Object], { k: { k2: 1 } }),
    ),

    testGroup("object of booleans",
        testParseAsOrThrow("empty object", "{}", [Object, Boolean], {}),
        testParseAsOrThrow("singleton boolean object", `{"k": true}`, [Object, Boolean], { k: true }),
        testParseAsOrThrowFailsWithTypeError("not an object (an array)", "[]", [Object, Boolean]),
        testParseAsOrThrowFailsWithTypeError("object of numbers", `{"k": 1}`, [Object, Boolean]),
    ),

    testGroup("string",
        testParseAsOrThrow("empty string", "\"\"", String, ""),
        testParseAsOrThrow("nonempty string", "\"test\"", String, "test"),
        testParseAsOrThrow("string with quotes", "\"t\\\"es\\\"t\"", String, "t\"es\"t"),
        testParseAsOrThrow("a string", "\"test\"", String, "test"),
        testParseAsOrThrowFailsWithTypeError("not a string", "true", String),
    ),

    testGroup("AnyTy",
        testParseAsOrThrow("empty array", "[]", AnyTy, []),
        testParseAsOrThrow("singleton number array", "[1]", AnyTy, [1]),
        testParseAsOrThrow("number", "1", AnyTy, 1),
        testParseAsOrThrow("boolean", "true", AnyTy, true),
    )
).runAsMain();

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

const basicSchemas = Schemas.emptySchemas();

basicSchemas.addSchema(Basic, basicSchema);

const parserBasic = new JsonParser(basicSchemas);

testGroup("parseAsOrThrow, with schema, Basic",
    testParseAsOrThrowWithParser(parserBasic, "ok", `{"p": true}`, Basic, new Basic(true)),
    testParseAsOrThrowFailsWithParser(parserBasic, "missing key", `{}`, Basic, JsonParser.MissingKeysError, "missing keys: p"),
    testParseAsOrThrowFailsWithParser(parserBasic, "extra key", `{"p": true, "q": 1}`, Basic, JsonParser.UnknownKeysError, "unknown keys: q"),
    testParseAsOrThrowFailsWithParser(parserBasic, "Basic, not on an object", '7', Basic, JsonParser.JsonTypeError),
).runAsMain();


class Basic2 {
    p: Basic;

    constructor(p: Basic) {
        this.p = p;
    }
}

const basic2Schema = JsonSchema.objectSchema<Basic2>('Basic2', {
    p: Basic,
}, (o) => { return new Basic2(o.get('p')); });

const basic2SchemaMap = Schemas.emptySchemas();
basic2SchemaMap.addSchema(Basic, basicSchema);
basic2SchemaMap.addSchema(Basic2, basic2Schema);

const basic2Parser = new JsonParser(basic2SchemaMap);

testGroup("parseAsOrThrow, with schema, Basic2",
    testParseAsOrThrowFailsWithParser(basic2Parser, "inner item does not match Basic, is empty", `{"p": {}}`, Basic2, JsonParser.MissingKeysError, "missing keys: p"),
    testParseAsOrThrowFailsWithParser(basic2Parser, "inner item does not match Basic, wrong type", `{"p": {"p": 1}}`, Basic2, JsonParser.JsonTypeError, "expected: boolean"),
    testParseAsOrThrowWithParser(basic2Parser, "ok", `{"p": {"p": true}}`, Basic2, new Basic2(new Basic(true))),
).runAsMain();

class MyArray<T> {
    arr: T[];

    constructor(arr: T[]) {
        this.arr = arr;
    }
}

const myArraySchemas = Schemas.emptySchemas();

myArraySchemas.addSchema(MyArray, (t: TySpec) => JsonSchema.arraySchema('MyArray', t, r => new MyArray(r)));
myArraySchemas.addSchema(Basic, basicSchema);
const myArrayParser = new JsonParser(myArraySchemas);

testGroup("parseAsOrThrow, with schema, MyArray",
    new Test("item is not of the correct type", () => {
        assertParseFailsWith(myArrayParser, '{"k":1}', MyArray, new JsonParser.JsonTypeError('MyArray', 'object', { k: 1 }))
    }),
    new Test("inner element is not of the correct type", () => {
        assertParseFailsWith(myArrayParser, '[1]', [MyArray, Boolean], new JsonParser.JsonTypeError('boolean', 'number', 1))
    }),
    testParseAsOrThrowWithParser(myArrayParser, "okay with array of boolean", "[true, false, true]", [MyArray, Boolean], new MyArray([true, false, true])),
    testParseAsOrThrowWithParser(myArrayParser, "okay with array of Basic", '[{"p": true}, {"p": false}]', [MyArray, Basic], new MyArray([new Basic(true), new Basic(false)])),
).runAsMain();


//////////////////////////////
///// Testing Exceptions /////
//////////////////////////////


function assertParseFailsWithClass(parser: JsonParser, toParse: string, spec: TySpec, expectedClass: any): any {
    const actual = parser.parseAs(toParse, spec);
    assert(actual.isLeft(), "expected the parse to fail but it didn't");
    assertEquals(actual.unwrapLeft().constructor, expectedClass);
    return actual;
}

function assertParseFailsWith(parser: JsonParser, toParse: string, spec: TySpec, expected: Error): void {
    const actual = assertParseFailsWithClass(parser, toParse, spec, expected.constructor);
    assertEquals(actual.unwrapLeft().message, expected.message);
}

function assertParseFailsWithTypeError(description: string, parser: JsonParser, toParse: string, spec: TySpec, expectedTy: string, actualTy: string, value: any) {
    return new Test(description, () => {
        assertParseFailsWith(parser, toParse, spec, new JsonParser.JsonTypeError(expectedTy, actualTy, value))
    });
}

function assertParseFailsWithUnknownSpec(description: string, parser: JsonParser, toParse: string, spec: TySpec, unknownSpec: TySpec) {
    return new Test(description, () => {
        assertParseFailsWith(parser, toParse, spec, new JsonParser.UnknownSpecError(unknownSpec))
    });
}

class Empty { }

testGroup("errors",
    testGroup("type error",
        assertParseFailsWithTypeError("expected boolean but got number, correct error", basicParser, '1', Boolean, 'boolean', 'number', 1),
        assertParseFailsWithTypeError("expected Empty but got number, correct error",
            new JsonParser(Schemas.emptySchemas().addSchema(Empty, JsonSchema.objectSchema<Empty>('Empty', {
            }, (_) => new Empty()))), `1`, Empty, 'Empty', 'number', 1),
        assertParseFailsWithTypeError("wrong field type, expected boolean but got number, correct error", basicParser, `{"p": 1}`, [Object, Boolean], 'boolean', 'number', 1),

        testParseAsOrThrowFails("arrays are wrapped in brackets and have commas in error message", '[1, 2]', Boolean, JsonParser.JsonTypeError, "but got: array: [1,2]"),
    ),

    new Test("missing keys", () => {
        assertParseFailsWith(
            new JsonParser(Schemas.emptySchemas().addSchema(Empty, JsonSchema.objectSchema<Empty>('missing keys test', {
                p1: Boolean,
                p2: Number,
                p3: null
            }, (_) => new Empty()))), `{"p2": 1}`, Empty, new JsonParser.MissingKeysError(['p1', 'p3']))
    }),

    new Test("unknown keys", () => {
        assertParseFailsWith(
            new JsonParser(Schemas.emptySchemas().addSchema(Empty, JsonSchema.objectSchema<Empty>('unknown keys test', {
                p2: Number,
            }, (_) => new Empty()))), `{"p1": true, "p2": 1, "p3": null}`, Empty, new JsonParser.UnknownKeysError(['p1', 'p3']))
    }),

    testGroup("unknown spec",
        assertParseFailsWithUnknownSpec("top level", new JsonParser(), '1', Empty, Empty),
        assertParseFailsWithUnknownSpec("in array", new JsonParser(), '[1]', [Array, Empty], Empty),
        assertParseFailsWithUnknownSpec("in other specification",
            new JsonParser(Schemas.emptySchemas().addSchema(Empty, JsonSchema.objectSchema<Empty>('unknown spec test', {
                p1: Basic,
            }, (_) => new Empty()))), `{"p1": 1}`, Empty, Basic),
        assertParseFailsWithUnknownSpec("nested",
            new JsonParser(Schemas.emptySchemas().addSchema(Empty, JsonSchema.objectSchema<Empty>('unknown spec test', {
                p1: [Basic, Empty],
            }, (_) => new Empty()))), `{"p1": 1}`, Empty, [Basic, Empty])
    ),
).runAsMain();
