import {
    assert,
    assertEquals,
    assertStringIncludes,
    assertThrows,
    Test,
    testGroup,
} from './deps.ts';

import {
    AnyTy,
    JsonParseError,
    JsonParser,
    JsonSchema,
    Schemas,
    TySpec,
} from '../mod.ts';

import {
    Maybe
} from '../src/functional.ts';

const basicParser = new JsonParser();

function testParseAsOrThrowWithParser(parser: JsonParser, innerDesc: string, toParse: string, ty: TySpec, expected: unknown): Test {
    return new Test(innerDesc, () => {
        assertEquals(parser.parseAsOrThrow(toParse, ty), expected);
    });
}

function testParseAsOrThrowFailsWithParser(parser: JsonParser, innerDesc: string, toParse: string, ty: TySpec, errTy: { new(...args: any[]): any }, msgIncludes?: string, exactMatch?: boolean): Test {
    return new Test(innerDesc, () => {
        const matchStr = msgIncludes !== undefined ? msgIncludes.trim() : undefined;
        const err = assertThrows(() => parser.parseAsOrThrow(toParse, ty), errTy, matchStr);
        if (exactMatch && matchStr !== undefined) {
            assertEquals(err.message, matchStr);
        }
    });
}

function testParseAsOrThrow(innerDesc: string, toParse: string, ty: TySpec, expected: any): Test {
    return testParseAsOrThrowWithParser(basicParser, innerDesc, toParse, ty, expected);
}

function testParseAsOrThrowFails(innerDesc: string, toParse: string, ty: TySpec, errTy: { new(...args: any[]): any }, msgIncludes?: string, exactMatch?: boolean): Test {
    return testParseAsOrThrowFailsWithParser(basicParser, innerDesc, toParse, ty, errTy, msgIncludes, exactMatch);
}

function testParseAsOrThrowFailsWithTypeError(innerDesc: string, toParse: string, ty: TySpec, msgIncludes?: string, exactMatch?: boolean): Test {
    return testParseAsOrThrowFailsWithParser(basicParser, innerDesc, toParse, ty, JsonParser.JsonTypeError, msgIncludes, exactMatch);
}

class Basic {
    p: boolean;

    constructor(p: boolean) {
        this.p = p;
    }
}

class Basic2 {
    p: Basic;

    constructor(p: Basic) {
        this.p = p;
    }
}

const basicSchema = JsonSchema.objectSchema<Basic>({
    'p': Boolean
}, (o) => {
    return new Basic(o.get('p'));
});

const basic2Schema = JsonSchema.objectSchema<Basic2>({
    p: Basic,
}, (o) => { return new Basic2(o.get('p')); });

class MyArray<T> {
    arr: T[];

    constructor(arr: T[]) {
        this.arr = arr;
    }
}

const basicSchemas = Schemas.emptySchemas();
basicSchemas.addSchema(Basic, basicSchema);

const basic2SchemaMap = Schemas.emptySchemas();
basic2SchemaMap.addSchema(Basic, basicSchema);
basic2SchemaMap.addSchema(Basic2, basic2Schema);

const myArraySchemas = Schemas.emptySchemas();
myArraySchemas.addSchema(MyArray, (t: TySpec) => JsonSchema.arraySchema(t, r => new MyArray(r)));
myArraySchemas.addSchema(Basic, basicSchema);
myArraySchemas.addAlias(MyArray, [MyArray, AnyTy]);

const customArray = Symbol("customArray");
const customArraySchemas = Schemas.emptySchemas();
customArraySchemas.addSchema(customArray, (t: TySpec) => JsonSchema.arraySchema(t, r => new MyArray(r)));
customArraySchemas.addDescription(customArray, 'custom array');
customArraySchemas.addAlias(customArray, [customArray, AnyTy]);
customArraySchemas.addSchema(Basic, basicSchema);

const parserBasic = new JsonParser(basicSchemas);
const basic2Parser = new JsonParser(basic2SchemaMap);
const myArrayParser = new JsonParser(myArraySchemas);
const customArrayParser = new JsonParser(customArraySchemas);

testGroup("parseAsOrThrow",
    testGroup("standard JSON types",
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
    ),

    testGroup("additional standard types",
        testGroup("Map",
            testParseAsOrThrow('empty map', '{}', Map, new Map()),
            testParseAsOrThrow('nonempty map', '{"k": 7}', Map, new Map([['k', 7]])),
            testParseAsOrThrow('map with string keys', '{"k": true}', [Map, String], new Map([['k', true]])),
            testParseAsOrThrow('map with boolean values', '{"k": true}', [Map, String, Boolean], new Map([['k', true]])),
            testParseAsOrThrowFailsWithTypeError('map with boolean values, but with a number', '{"k": 1}', [Map, String, Boolean]),
            testParseAsOrThrowFails('map with boolean keys', '{"k": 1}', [Map, Boolean], JsonParser.UnknownSpecError),
            testParseAsOrThrowFails('map with boolean keys and boolean values', '{"k": 1}', [Map, Boolean, Boolean], JsonParser.UnknownSpecError),
        ),

        testGroup("Set",
            testParseAsOrThrow("empty array", "[]", Set, new Set()),
            testParseAsOrThrow("singleton number array", "[1]", Set, new Set([1])),
            testParseAsOrThrow("mixed element array", "[1, true, [5], \"test\"]", Set, new Set([1, true, [5], "test"])),
            testParseAsOrThrowFailsWithTypeError("not an array (an object)", "{}", Set),
        ),
    ),

    testGroup("special specs",
        testGroup("AnyTy",
            testParseAsOrThrow("array", '[[], false, null, 2, {}, "test"]', AnyTy,
                [[], false, null, 2, {}, "test"]),
            testParseAsOrThrow("singleton number array", "[1]", AnyTy, [1]),
            testParseAsOrThrow("boolean", "true", AnyTy, true),
            testParseAsOrThrow("null", "null", AnyTy, null),
            testParseAsOrThrow("number", "1", AnyTy, 1),
            testParseAsOrThrow("object",
                '{"k1": [], "k2": true, "k3": null, "k4": 1, "k5": {}, "k6": "test"}', AnyTy,
                { k1: [], k2: true, k3: null, k4: 1, k5: {}, k6: "test" }),
            testParseAsOrThrow("string", '"test"', AnyTy, "test"),
        ),
    ),

    testGroup("with schema",
        testGroup("Basic",
            testParseAsOrThrowWithParser(parserBasic, "ok", `{"p": true}`, Basic, new Basic(true)),
            assertParseFailsWithMissingKeys("missing key", parserBasic, `{}`, Basic, ["p"]),
            assertParseFailsWithUnknownKeys("extra key", parserBasic, `{"p": true, "q": 1}`, Basic, ["q"]),
            testParseAsOrThrowFailsWithParser(parserBasic, "Basic, not on an object", '7', Basic, JsonParser.JsonTypeError),
        ),

        testGroup("Basic2",
            assertParseFailsWithMissingKeys("inner item does not match Basic, is empty", basic2Parser, `{"p": {}}`, Basic2, ["p"]),
            assertParseFailsWithTypeError("inner item does not match Basic, wrong type", basic2Parser, `{"p": {"p": 1}}`, Basic2, Boolean, 'number', 1),
            testParseAsOrThrowWithParser(basic2Parser, "ok", `{"p": {"p": true}}`, Basic2, new Basic2(new Basic(true))),
        ),

        testGroup("MyArray",
            assertParseFailsWithTypeError("item is not of the correct type", myArrayParser, '{"k":1}', MyArray, MyArray, 'object', { k: 1 }),
            assertParseFailsWithTypeError("inner element is not of the correct type", myArrayParser, '[1]', [MyArray, Boolean], Boolean, 'number', 1),
            testParseAsOrThrowWithParser(myArrayParser, "okay with array of boolean", "[true, false, true]", [MyArray, Boolean], new MyArray([true, false, true])),
            testParseAsOrThrowWithParser(myArrayParser, "okay with array of Basic", '[{"p": true}, {"p": false}]', [MyArray, Basic], new MyArray([new Basic(true), new Basic(false)])),
        ),

        testGroup("symbol to override array spec",
            assertParseFailsWithTypeError("item is not of the correct type", customArrayParser, '{"k":1}', customArray, customArray, 'object', { k: 1 }),
            assertParseFailsWithTypeError("inner element is not of the correct type", customArrayParser, '[1]', [customArray, Boolean], Boolean, 'number', 1),
            testParseAsOrThrowWithParser(customArrayParser, "okay with array of boolean", "[true, false, true]", [customArray, Boolean], new MyArray([true, false, true])),
            testParseAsOrThrowWithParser(customArrayParser, "okay with array of Basic", '[{"p": true}, {"p": false}]', [customArray, Basic], new MyArray([new Basic(true), new Basic(false)])),
        ),
    ),
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

function assertParseFailsWith(parser: JsonParser, toParse: string, spec: TySpec, errTy: { new(...args: any[]): JsonParseError }, msgIncludes: string): void {
    const actual = assertParseFailsWithClass(parser, toParse, spec, errTy);
    assertStringIncludes(actual.unwrapLeft().message, msgIncludes);
}

function assertParseFailsWithMissingKeys(description: string, parser: JsonParser, toParse: string, spec: TySpec, keys: string[]) {
    return new Test(description, () => {
        assertParseFailsWith(parser, toParse, spec, JsonParser.MissingKeysError, `
But the following keys are required and were not specified: ${keys.map(k => JSON.stringify(k)).join(', ')}`)
    });
}

function assertParseFailsWithTypeError(description: string, parser: JsonParser, toParse: string, spec: TySpec, expectedTy: TySpec, actualTy: string, value: any) {
    return new Test(description, () => {
        assertParseFailsWith(parser, toParse, spec, JsonParser.JsonTypeError,
            `When trying to read a value for specification: ${parser._getDescriptionForSpec(expectedTy)}
I saw: ${JSON.stringify(value)}
But this is a ${actualTy}`)
    });
}

function assertParseFailsWithUnknownKeys(description: string, parser: JsonParser, toParse: string, spec: TySpec, keys: string[]) {
    return new Test(description, () => {
        assertParseFailsWith(parser, toParse, spec, JsonParser.UnknownKeysError, `
But I saw the following keys which are not accepted by the specification: ${keys.map(k => JSON.stringify(k)).join(', ')}`)
    });
}

function assertParseFailsWithUnknownSpec(description: string, parser: JsonParser, toParse: string, spec: TySpec, unknownSpecDescription: string) {
    return new Test(description, () => {
        assertParseFailsWith(parser, toParse, spec, JsonParser.UnknownSpecError, `But I don't know how to parse a value for the specification: ${unknownSpecDescription}`)
    });
}

class Empty { }

testGroup("errors",
    testGroup("type error",
        assertParseFailsWithTypeError("expected boolean but got number, correct error", basicParser, '1', Boolean, Boolean, 'number', 1),
        assertParseFailsWithTypeError("expected Empty but got number, correct error",
            new JsonParser(Schemas.emptySchemas().addSchema(Empty, JsonSchema.objectSchema<Empty>({
            }, (_) => new Empty()))), `1`, Empty, Empty, 'number', 1),
        assertParseFailsWithTypeError("wrong field type, expected boolean but got number, correct error", basicParser, `{ "p": 1 }`, [Object, Boolean], Boolean, 'number', 1),

        testParseAsOrThrowFails("arrays are wrapped in brackets and have commas in error message", '[1, 2]', Boolean, JsonParser.JsonTypeError, "I saw: [1,2]"),

        testParseAsOrThrowFails("correct string for simple error", '1', Boolean, JsonParser.JsonTypeError, `
When trying to read a value for specification: boolean
I saw: 1
But this is a number
`, true),
        testParseAsOrThrowFails("correct string for slightly complex error", '{"p": true}', [Object, Number], JsonParser.JsonTypeError, `
When trying to read a value for specification: Object whose values are number
I saw: {"p":true}
In key: "p"
When trying to read a value for specification: number
I saw: true
But this is a boolean
`, true),
    ),

    testGroup("missing keys",
        assertParseFailsWithMissingKeys("correct error",
            new JsonParser(Schemas.emptySchemas().addSchema(Empty, JsonSchema.objectSchema<Empty>({
                p1: Boolean,
                p2: Number,
                p3: null
            }, (_) => new Empty()))), `{ "p2": 1 } `, Empty, ['p1', 'p3']),

        testParseAsOrThrowFailsWithParser(
            new JsonParser(Schemas.emptySchemas().addSchema(Empty, JsonSchema.objectSchema<Empty>({
                p1: Boolean,
                p2: Number,
                p3: null
            }, (_) => new Empty()))), "correct string for error", `{ "p2": 1 }`, Empty, JsonParser.MissingKeysError, `
When trying to read a value for specification: Empty
I saw: {"p2":1}
But the following keys are required and were not specified: "p1", "p3"
`, true),
    ),

    testGroup("unknown keys",
        assertParseFailsWithUnknownKeys("correct error",
            new JsonParser(Schemas.emptySchemas().addSchema(Empty, JsonSchema.objectSchema<Empty>({
                p2: Number,
            }, (_) => new Empty()))), `{ "p1": true, "p2": 1, "p3": null } `, Empty, ['p1', 'p3']),

        testParseAsOrThrowFailsWithParser(
            new JsonParser(Schemas.emptySchemas().addSchema(Empty, JsonSchema.objectSchema<Empty>({
                p2: Number,
            }, (_) => new Empty()))), "correct string for error", `{ "p1": true, "p2": 1, "p3": null } `, Empty, JsonParser.UnknownKeysError, `
When trying to read a value for specification: Empty
I saw: {"p1":true,"p2":1,"p3":null}
But I saw the following keys which are not accepted by the specification: "p1", "p3"
`, true),
    ),

    testGroup("unknown spec",
        assertParseFailsWithUnknownSpec("top level", new JsonParser(), '1', Empty, 'Empty'),
        testParseAsOrThrowFails("correct string for simple error", '1', Empty, JsonParser.UnknownSpecError, `
When trying to read a value for specification: Empty
I saw: 1
But I don't know how to parse a value for the specification: Empty
`, true),
        assertParseFailsWithUnknownSpec("in array", new JsonParser(), '[1]', [Array, Empty], 'Empty'),
        assertParseFailsWithUnknownSpec("in other specification",
            new JsonParser(Schemas.emptySchemas().addSchema(Empty, JsonSchema.objectSchema<Empty>({
                p1: Basic,
            }, (_) => new Empty()))), `{ "p1": 1 } `, Empty, 'Basic'),
        assertParseFailsWithUnknownSpec("nested",
            new JsonParser(Schemas.emptySchemas().addSchema(Empty, JsonSchema.objectSchema<Empty>({
                p1: [Basic, Empty],
            }, (_) => new Empty()))), `{ "p1": 1 } `, Empty, '[Basic, Empty]')
    ),
).runAsMain();


const wants2Args = Symbol("wants2Args");
const justAString = Symbol("justAString");
const wantsNoArgs = Symbol("wantsNoArgs");

const errSchema = new Schemas();
errSchema.addDescription(wants2Args, getDesc => (t1, t2) => `the description with ${getDesc(t1)} and ${getDesc(t2)}`);
errSchema.addDescription(justAString, "Just a string");
errSchema.addDescription(wantsNoArgs, _ => () => "wanted no args");
const resSchema = JsonSchema.arraySchema([Map, Number, Boolean], t => t);
errSchema.addSchema(wants2Args, (_t1, _t2) => resSchema);
errSchema.addSchema(wantsNoArgs, () => JsonSchema.booleanSchema(x => x));

function testWrongNumberOfSpecArguments(desc: string, f: () => any, spec: TySpec, numActual: number, numExpected: number): Test {
    return new Test(desc, () => {
        const err = assertThrows(f, Schemas.WrongNumberOfArgumentsError);
        assertEquals(err.message, `The specification ${Schemas._getDescriptionBase(spec)} was given ${numActual} arguments, but expected ${numExpected}`);
    });
}

function testWrongNumberOfDescriptionSpecArguments(desc: string, spec: TySpec, specExpected: TySpec, numActual: number, numExpected: number): Test {
    return testWrongNumberOfSpecArguments(desc, () => errSchema.getDescription(spec), specExpected, numActual, numExpected);
}

function testWrongNumberOfSchemaSpecArguments(desc: string, spec: TySpec, specExpected: TySpec, numActual: number, numExpected: number): Test {
    return testWrongNumberOfSpecArguments(desc, () => errSchema.getSchemaForSpec(spec), specExpected, numActual, numExpected);
}

function testGetDescriptionOkay(desc: string, spec: TySpec, expected: string): Test {
    return new Test(desc, () => {
        assertEquals(errSchema.getDescription(spec), expected)
    });
}

function testGetSchemaOkay(desc: string, spec: TySpec, expected: JsonSchema<any>): Test {
    return new Test(desc, () => {
        assertEquals(errSchema.getSchemaForSpec(spec), Maybe.some(expected))
    });
}

testGroup("Schemas",
    testGroup("getDescription",
        testGroup("too few spec arguments",
            testWrongNumberOfDescriptionSpecArguments("0 instead of 2", wants2Args, wants2Args, 0, 2),
            testWrongNumberOfDescriptionSpecArguments("1 instead of 2", [wants2Args, Number], wants2Args, 1, 2),
        ),
        testGroup("correct number of spec arguments",
            testGetDescriptionOkay("with function", [wants2Args, Number, Boolean], "the description with Number and Boolean"),
            testGetDescriptionOkay("0 with function", wantsNoArgs, "wanted no args"),
            testGetDescriptionOkay("0 with string", justAString, "Just a string"),
            testGetDescriptionOkay("1 with string", [justAString, Number], "Just a string"),
        ),
        testGroup("too many spec arguments",
            testWrongNumberOfDescriptionSpecArguments("3 instead of 2", [wants2Args, Number, Boolean, String], wants2Args, 3, 2),
            testWrongNumberOfDescriptionSpecArguments("1 instead of 0", [wantsNoArgs, Number], wantsNoArgs, 1, 0),
        ),
    ),
    testGroup("getSchemaForSpec",
        testGroup("too few spec arguments",
            testWrongNumberOfSchemaSpecArguments("0 instead of 2", wants2Args, wants2Args, 0, 2),
            testWrongNumberOfSchemaSpecArguments("1 instead of 2", [wants2Args, Number], wants2Args, 1, 2),
        ),
        testGetSchemaOkay("correct number of spec arguments", [wants2Args, Number, Boolean], resSchema),
        testGroup("too many spec arguments",
            testWrongNumberOfSchemaSpecArguments("1 instead of 0", [wantsNoArgs, Number], wantsNoArgs, 1, 0),
            testWrongNumberOfSchemaSpecArguments("3 instead of 2", [wants2Args, Number, Boolean, String], wants2Args, 3, 2),
        ),
    ),
).runAsMain();
