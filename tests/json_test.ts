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

type InnerTest = (topDesc: string) => void;

interface Testable {
    /** Run the test as a subtest of another test. */
    runAsInner: InnerTest;

    /** Run the test as a top-level test. */
    runAsMain: () => void;
}

class Test implements Testable {
    description: string;
    runner: () => void;

    constructor(description: string, runner: () => void) {
        this.description = description;
        this.runner = runner;
    }

    runAsInner(topDesc: string) {
        Deno.test(`${topDesc}, ${this.description}`, this.runner);
    }

    runAsMain() {
        Deno.test(`${this.description}`, this.runner);
    }
}

class TestGroup implements Testable {
    private namePart: string;

    private tests: Testable[];

    constructor(namePart: string, ...tests: Testable[]) {
        this.namePart = namePart;
        this.tests = tests;
    }

    runAsInner(topDesc: string) {
        this.tests.map(t => t.runAsInner(`${topDesc}, ${this.namePart}`));
    }

    runAsMain() {
        this.tests.map(t => t.runAsInner(`${this.namePart}`));
    }
}

function testGroup(topDesc: string, ...tests: Testable[]): TestGroup {
    return new TestGroup(topDesc, ...tests);
}

function testParseAsOrThrowWithParser(parser: JsonParser, innerDesc: string, toParse: string, ty: any, expected: any): Test {
    return new Test(innerDesc, () => {
        assertEquals(parser.parseAsOrThrow(toParse, ty), expected);
    });
}

function testParseAsOrThrowFailsWithParser(parser: JsonParser, innerDesc: string, toParse: string, ty: any, errTy: { new(...args: any[]): any }, msgIncludes?: string): Test {
    //function testParseAsOrThrowFailsWithParser(parser: JsonParser, innerDesc: string, toParse: string, ty: ParseTySpec<any>, errTy: { new(...args: any[]): any }, msgIncludes?: string) {
    return new Test(innerDesc, () => {
        assertThrows(() => parser.parseAsOrThrow(toParse, ty), errTy, msgIncludes);
    });
}

function testParseAsOrThrow(innerDesc: string, toParse: string, ty: any, expected: any): Test {
    return testParseAsOrThrowWithParser(basicParser, innerDesc, toParse, ty, expected);
}

function testParseAsOrThrowFails(innerDesc: string, toParse: string, ty: any, errTy: { new(...args: any[]): any }, msgIncludes?: string): Test {
    return testParseAsOrThrowFailsWithParser(basicParser, innerDesc, toParse, ty, errTy, msgIncludes);
}

testGroup("parseAsOrThrow",
    testGroup("array",
        testParseAsOrThrow("empty array", "[]", Array, []),
        testParseAsOrThrow("singleton number array", "[1]", Array, [1]),
        testParseAsOrThrow("mixed element array", "[1, true, [5], \"test\"]", Array, [1, true, [5], "test"]),
        testParseAsOrThrowFails("not an array (an object)", "{}", Array, JsonParser.JsonTypeError),
    ),

    testGroup("array of arrays",
        testParseAsOrThrow("singleton number nested array", "[[1]]", [Array, Array], [[1]]),
    ),

    testGroup("array of booleans",
        testParseAsOrThrow("empty array", "[]", [Array, Boolean], []),
        testParseAsOrThrow("singleton boolean array", "[true]", [Array, Boolean], [true]),
        testParseAsOrThrowFails("not an array (an object)", "{}", [Array, Boolean], JsonParser.JsonTypeError),
        testParseAsOrThrowFails("array of numbers", "[1]", [Array, Boolean], JsonParser.JsonTypeError),
    ),

    testGroup("boolean",
        testParseAsOrThrow("true", "true", Boolean, true),
        testParseAsOrThrow("false", "false", Boolean, false),
        testParseAsOrThrowFails("not a boolean", "null", Boolean, JsonParser.JsonTypeError),
    ),

    testGroup("number",
        testParseAsOrThrow("7", "7", Number, 7),
        testParseAsOrThrowFails("not a number", "true", Number, JsonParser.JsonTypeError),
    ),

    testGroup("null",
        testParseAsOrThrow("null", "null", null, null),
        testParseAsOrThrowFails("not null", "true", null, JsonParser.JsonTypeError),
    ),

    testGroup("object",
        testParseAsOrThrow("empty object", "{}", Object, {}),
        testParseAsOrThrow("singleton number object", `{ "k": 1 }`, Object, { k: 1 }),
        testParseAsOrThrow("mixed element object", `{"k1": 1, "k2": true, "k3": { "k31": [7] }, "k4": \"test\"}`, Object, { k1: 1, k2: true, k3: { k31: [7] }, k4: "test" }),
        testParseAsOrThrowFails("not an object (an array)", "[]", Object, JsonParser.JsonTypeError),
    ),

    testGroup("object of objects",
        testParseAsOrThrow("singleton number nested object", `{"k": {"k2": 1}}`, [Object, Object], { k: { k2: 1 } }),
    ),

    testGroup("object of booleans",
        testParseAsOrThrow("empty object", "{}", [Object, Boolean], {}),
        testParseAsOrThrow("singleton boolean object", `{"k": true}`, [Object, Boolean], { k: true }),
        testParseAsOrThrowFails("not an object (an array)", "[]", [Object, Boolean], JsonParser.JsonTypeError),
        testParseAsOrThrowFails("object of numbers", `{"k": 1}`, [Object, Boolean], JsonParser.JsonTypeError),
    ),

    testGroup("string",
        testParseAsOrThrow("empty string", "\"\"", String, ""),
        testParseAsOrThrow("nonempty string", "\"test\"", String, "test"),
        testParseAsOrThrow("string with quotes", "\"t\\\"es\\\"t\"", String, "t\"es\"t"),
        testParseAsOrThrow("a string", "\"test\"", String, "test"),
        testParseAsOrThrowFails("not a string", "true", String, JsonParser.JsonTypeError),
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

const basicSchemas = new Map();

basicSchemas.set(Basic, basicSchema);

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

const basic2SchemaMap = new Map();
basic2SchemaMap.set(Basic, basicSchema);
basic2SchemaMap.set(Basic2, basic2Schema);

const basic2Parser = new JsonParser(basic2SchemaMap);

testGroup("parseAsOrThrow, with schema, Basic2",
    testParseAsOrThrowFailsWithParser(basic2Parser, "inner item does not match Basic, is empty", `{"p": {}}`, Basic2, JsonParser.MissingKeysError, "missing keys: p"),
    testParseAsOrThrowFailsWithParser(basic2Parser, "inner item does not match Basic, wrong type", `{"p": {"p": 1}}`, Basic2, JsonParser.JsonTypeError, "expected: boolean"),
    testParseAsOrThrowWithParser(basic2Parser, "ok", `{"p": {"p": true}}`, Basic2, new Basic2(new Basic(true))),
).runAsMain();


//////////////////////////////
///// Testing Exceptions /////
//////////////////////////////


function assertParseFailsWithClass(actual: JsonParseResult<any>, expectedClass: any): void {
    assert(actual.isLeft(), "expected the parse to fail but it didn't");
    assertEquals(actual.unwrapLeft().constructor, expectedClass);
}

function assertParseFailsWith(actual: JsonParseResult<any>, expected: Error): void {
    assertParseFailsWithClass(actual, expected.constructor);
    assertEquals(actual.unwrapLeft().message, expected.message);
}

class Empty { }

testGroup("errors",
    testGroup("type error",
        new Test("expected boolean but got number, correct error", () => {
            assertParseFailsWith(basicParser.parseAs('1', Boolean), new JsonParser.JsonTypeError('boolean', 'number', 1))
        }),
        new Test("expected Empty but got number, correct error", () => {
            assertParseFailsWith(new JsonParser(new Map().set(Empty, JsonSchema.objectSchema<Empty>('Empty', {
            }, (_) => new Empty()))).parseAs(`1`, Empty), new JsonParser.JsonTypeError('Empty', 'number', 1))
        }),
        new Test("wrong field type, expected boolean but got number, correct error", () => {
            assertParseFailsWith(basicParser.parseAs(`{"p": 1}`, [Object, Boolean]), new JsonParser.JsonTypeError('boolean', 'number', 1))
        }),
    ),

    new Test("missing keys", () => {
        assertParseFailsWith(
            new JsonParser(new Map().set(Empty, JsonSchema.objectSchema<Empty>('missing keys test', {
                p1: Boolean,
                p2: Number,
                p3: null
            }, (_) => new Empty()))).parseAs(`{"p2": 1}`, Empty), new JsonParser.MissingKeysError(['p1', 'p3']))
    }),

    new Test("unknown keys", () => {
        assertParseFailsWith(
            new JsonParser(new Map().set(Empty, JsonSchema.objectSchema<Empty>('unknown keys test', {
                p2: Number,
            }, (_) => new Empty()))).parseAs(`{"p1": true, "p2": 1, "p3": null}`, Empty), new JsonParser.UnknownKeysError(['p1', 'p3']))
    }),
).runAsMain();
