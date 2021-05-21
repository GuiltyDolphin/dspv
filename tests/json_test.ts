import {
    assert,
    assertEquals,
    assertStringIncludes,
    assertThrows,
    Test,
    testGroup,
} from './deps.ts';

import {
    anyOf,
    AnyTy,
    JsonParseError,
    JsonParser,
    JsonSchema,
    Schemas,
    tuple,
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
    return new Basic(o.p);
});

const basic2Schema = JsonSchema.objectSchema<Basic2>({
    p: Basic,
}, (o) => { return new Basic2(o.p); });

class MyArray<T> {
    arr: T[];

    constructor(arr: T[]) {
        this.arr = arr;
    }
}

const basicSchemas = Schemas.emptySchemas();
basicSchemas.addSpec(Basic, { load: basicSchema });

const basic2SchemaMap = Schemas.emptySchemas();
basic2SchemaMap.addSpec(Basic, { load: basicSchema });
basic2SchemaMap.addSpec(Basic2, { load: basic2Schema });

const myArraySchemas = Schemas.emptySchemas();
myArraySchemas.addSpec(MyArray, {
    maxArgs: 1,
    load: (t = AnyTy) => JsonSchema.arraySchema(t, r => new MyArray(r))
});
myArraySchemas.addSpec(Basic, { load: basicSchema });

const customArray = Symbol("customArray");
const customArraySchemas = Schemas.emptySchemas();
customArraySchemas.addSpec(customArray, {
    description: 'custom array',
    load: (t: TySpec) => JsonSchema.arraySchema(t, r => new MyArray(r))
});
customArraySchemas.addAlias(customArray, [customArray, AnyTy]);
customArraySchemas.addSpec(Basic, { load: basicSchema });

const alwaysEmptyArray = Symbol('alwaysEmptyArray');
const negatedBoolean = Symbol('negatedBoolean');
const nullBecomes5 = Symbol('nullBecomes5');
const alwaysZero = Symbol('alwaysZero');
const alwaysEmptyObject = Symbol('alwaysEmptyObject');
const alwaysEmptyString = Symbol('alwaysEmptyString');
const extraSchemas = Schemas.emptySchemas()
    .addSpec(alwaysEmptyArray, { load: JsonSchema.arraySchema(AnyTy, _ => []) })
    .addSpec(negatedBoolean, { load: JsonSchema.booleanSchema(r => !r) })
    .addSpec(nullBecomes5, { load: JsonSchema.nullSchema(_ => 5) })
    .addSpec(alwaysZero, { load: JsonSchema.numberSchema(_ => 0) })
    .addSpec(alwaysEmptyObject, { load: JsonSchema.objectSchemaMap(_ => AnyTy, _ => new Object()) })
    .addSpec(alwaysEmptyString, { load: JsonSchema.stringSchema(_ => "") })

const parserBasic = new JsonParser(basicSchemas);
const basic2Parser = new JsonParser(basic2SchemaMap);
const myArrayParser = new JsonParser(myArraySchemas);
const customArrayParser = new JsonParser(customArraySchemas);
const parserWithExtra = new JsonParser(extraSchemas);

const anyOfMixElems: TySpec = [anyOf, alwaysEmptyArray, negatedBoolean, nullBecomes5, alwaysZero, alwaysEmptyObject, alwaysEmptyString];

const numGreaterThan0 = Symbol();
const numGreaterThan0OrArrayOf = Symbol();

const numGT0OrArrayParser = new JsonParser(Schemas.emptySchemas()
    .addSpec(numGreaterThan0, {
        description: 'a number greater than zero',
        load: JsonSchema.customSchema<number>({
            onNumber: (parser, json) => {
                const n = json.unwrap();
                if (n > 0) {
                    return JsonParser.parseOk(n);
                }
                return parser.failWithTypeError('number not greater than zero');
            }
        })
    })
    .addSpec(numGreaterThan0OrArrayOf, {
        description: 'a number greater than zero or an array of these',
        load: JsonSchema.customSchema<number | number[]>({
            onNumber: numGreaterThan0,
            onArray: [Array, numGreaterThan0]
        })
    })
);

testGroup("parseAsOrThrow",
    testGroup("standard JSON types",
        testGroup("array",
            testParseAsOrThrow("empty array", "[]", Array, []),
            testParseAsOrThrow("empty array (alt)", "[]", [Array], []),
            testParseAsOrThrow("singleton number array", "[1]", Array, [1]),
            testParseAsOrThrow("mixed element array", "[1, true, [5], \"test\"]", Array, [1, true, [5], "test"]),
            testParseAsOrThrow("mixed element array (alt)", "[1, true, [5], \"test\"]", [Array], [1, true, [5], "test"]),
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
        testGroup("anyOf",
            testGroup("boolean or string",
                testParseAsOrThrow("true", 'true', [anyOf, Boolean, String], true),
                testParseAsOrThrow('"test"', '"test"', [anyOf, Boolean, String], "test"),
                testParseAsOrThrowFailsWithTypeError("a number", '1', [anyOf, Boolean, String]),
            ),
            testGroup("empty array or negated boolean or null becomes 5 or always zero or always empty string or always empty object",
                testParseAsOrThrowWithParser(parserWithExtra, '[[3], true, null, 1, "test", {"k": 1}]', '[[3], true, null, 1, "test", {"k": 1}]', [Array, anyOfMixElems], [[], false, 5, 0, "", {}]),
            ),
            testGroup("boolean or string or number inside array",
                testParseAsOrThrow('[true, 1, "test"]', '[true, 1, "test"]', [Array, [anyOf, Boolean, String, Number]], [true, 1, "test"]),
                testParseAsOrThrow('"test"', '"test"', [anyOf, Boolean, String], "test"),
                assertParseFailsWithTypeError("a number", basicParser, '1', [Array, [anyOf, Boolean, String, Number]], [Array, [anyOf, Boolean, String, Number]], 'number', 1),
                assertParseFailsWithTypeError("no matching elements", basicParser, '[null]', [Array, [anyOf, Boolean, String, Number]], [anyOf, Boolean, String, Number], 'null', null),
            ),
        ),

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

        testGroup("tuple",
            testGroup("empty tuple",
                testParseAsOrThrow("empty array", '[]', [tuple], []),
                assertParseFailsWithTypeError("non-empty array", basicParser, '[[]]', [tuple], [tuple], 'array of length 1', [[]]),
            ),
            testGroup('tuple of [String, Boolean, Number]',
                testParseAsOrThrow("okay array", '["test", true, 7]', [tuple, String, Boolean, Number], ["test", true, 7]),
                assertParseFailsWithTypeError("wrong type for first param", basicParser, '[true, true, 1]', [tuple, String, Boolean, Number], String, 'boolean', true),
                assertParseFailsWithTypeError("wrong type for second param", basicParser, '["test", "test", 1]', [tuple, String, Boolean, Number], Boolean, 'string', "test"),
                assertParseFailsWithTypeError("wrong type for third param", basicParser, '["test", true, null]', [tuple, String, Boolean, Number], Number, 'null', null),
                assertParseFailsWithTypeError("empty array", basicParser, '[]', [tuple, String, Boolean, Number], [tuple, String, Boolean, Number], 'array of length 0', []),
                assertParseFailsWithTypeError("length too short", basicParser, '["test", true]', [tuple, String, Boolean, Number], [tuple, String, Boolean, Number], 'array of length 2', ["test", true]),
                assertParseFailsWithTypeError("length too long", basicParser, '["test", true, 7, null]', [tuple, String, Boolean, Number], [tuple, String, Boolean, Number], 'array of length 4', ["test", true, 7, null]),
            ),
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

        testGroup("referencing specifications, number greater than zero or array of this",
            testParseAsOrThrowWithParser(numGT0OrArrayParser, "array of number >0", '[1, 2, 3]', numGreaterThan0OrArrayOf, [1, 2, 3]),
            testParseAsOrThrowWithParser(numGT0OrArrayParser, "number >0", '1', numGreaterThan0OrArrayOf, 1),
            assertParseFailsWithTypeError("number =0", numGT0OrArrayParser, '0', numGreaterThan0OrArrayOf, numGreaterThan0, 'number not greater than zero', 0),
            assertParseFailsWithTypeError("array with number =0", numGT0OrArrayParser, '[0]', numGreaterThan0OrArrayOf, numGreaterThan0, 'number not greater than zero', 0),
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
        const determiner = actualTy.match('^[aoeiu]') ? 'an' : 'a';
        assertParseFailsWith(parser, toParse, spec, JsonParser.JsonTypeError,
            `When trying to read a value for specification: ${parser._getDescriptionForSpec(expectedTy)}
I saw: ${JSON.stringify(value)}
But this is ${determiner} ${actualTy}`)
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

class Person {
    age: number;
    address: string;

    constructor(age: number, address: string) {
        this.age = age;
        this.address = address;
    }
}

const personParser = new JsonParser(Schemas.emptySchemas().addSpec(Person, {
    description: "A person with an age and address",
    load: JsonSchema.objectSchema<Person>({
        age: Number,
        address: String
    }, (o) => new Person(o.age, o.address))
}));

testGroup("errors",
    testGroup("type error",
        assertParseFailsWithTypeError("expected boolean but got number, correct error", basicParser, '1', Boolean, Boolean, 'number', 1),
        assertParseFailsWithTypeError("expected Empty but got number, correct error",
            new JsonParser(Schemas.emptySchemas().addSpec(Empty, {
                load: JsonSchema.objectSchema<Empty>({
                }, (_) => new Empty())
            })), `1`, Empty, Empty, 'number', 1),
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
        testParseAsOrThrowFailsWithParser(
            personParser, "correct string for objectSchema inside key (bad age)", '{"age": "not a number", "address": "somewhere on Earth"}', Person, JsonParser.JsonTypeError, `
When trying to read a value for specification: A person with an age and address
I saw: {"age":"not a number","address":"somewhere on Earth"}
In key: "age"
When trying to read a value for specification: number
I saw: "not a number"
But this is a string
`, true),
        testParseAsOrThrowFailsWithParser(
            personParser, "correct string for objectSchema inside key (bad address)", '{"age": 20, "address": 7}', Person, JsonParser.JsonTypeError, `
When trying to read a value for specification: A person with an age and address
I saw: {"age":20,"address":7}
In key: "address"
When trying to read a value for specification: string
I saw: 7
But this is a number
`, true),
        testParseAsOrThrowFails("errors for arrays include index of failure",
            '[0, 1, 2, true, 4]', [Array, Number], JsonParser.JsonTypeError, `
When trying to read a value for specification: Array of number
I saw: [0,1,2,true,4]
At index: 3
When trying to read a value for specification: number
I saw: true
But this is a boolean
`, true),
        testGroup("correct determiner",
            testParseAsOrThrowFails("for array", '[]', [Object, Number], JsonParser.JsonTypeError, `
When trying to read a value for specification: Object whose values are number
I saw: []
But this is an array
`, true),
            testParseAsOrThrowFails("for object", '{}', [Array, AnyTy], JsonParser.JsonTypeError, `
When trying to read a value for specification: Array of anything
I saw: {}
But this is an object
`, true),
            testParseAsOrThrowFails("for string", '""', [Array, AnyTy], JsonParser.JsonTypeError, `
When trying to read a value for specification: Array of anything
I saw: ""
But this is a string
`, true),
        ),
    ),

    testGroup("missing keys",
        assertParseFailsWithMissingKeys("correct error",
            new JsonParser(Schemas.emptySchemas().addSpec(Empty, {
                load: JsonSchema.objectSchema<Empty>({
                    p1: Boolean,
                    p2: Number,
                    p3: null
                }, (_) => new Empty())
            })), `{ "p2": 1 } `, Empty, ['p1', 'p3']),

        testParseAsOrThrowFailsWithParser(
            new JsonParser(Schemas.emptySchemas().addSpec(Empty, {
                load: JsonSchema.objectSchema<Empty>({
                    p1: Boolean,
                    p2: Number,
                    p3: null
                }, (_) => new Empty())
            })), "correct string for error", `{ "p2": 1 }`, Empty, JsonParser.MissingKeysError, `
When trying to read a value for specification: Empty
I saw: {"p2":1}
But the following keys are required and were not specified: "p1", "p3"
`, true),
    ),

    testGroup("unknown keys",
        assertParseFailsWithUnknownKeys("correct error",
            new JsonParser(Schemas.emptySchemas().addSpec(Empty, {
                load: JsonSchema.objectSchema<Empty>({
                    p2: Number,
                }, (_) => new Empty())
            })), `{ "p1": true, "p2": 1, "p3": null } `, Empty, ['p1', 'p3']),

        testParseAsOrThrowFailsWithParser(
            new JsonParser(Schemas.emptySchemas().addSpec(Empty, {
                load: JsonSchema.objectSchema<Empty>({
                    p2: Number,
                }, (_) => new Empty())
            })), "correct string for error", `{ "p1": true, "p2": 1, "p3": null } `, Empty, JsonParser.UnknownKeysError, `
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
            new JsonParser(Schemas.emptySchemas().addSpec(Empty, {
                load: JsonSchema.objectSchema<Empty>({
                    p1: Basic,
                }, (_) => new Empty())
            })), `{ "p1": 1 } `, Empty, 'Basic'),
        assertParseFailsWithUnknownSpec("nested",
            new JsonParser(Schemas.emptySchemas().addSpec(Empty, {
                load: JsonSchema.objectSchema<Empty>({
                    p1: [Basic, Empty],
                }, (_) => new Empty())
            })), `{ "p1": 1 } `, Empty, '[Basic, Empty]')
    ),
).runAsMain();


const wants2Args = Symbol("wants2Args");
const justAString = Symbol("justAString");
const wantsNoArgs = Symbol("wantsNoArgs");
const wants2To3Args = Symbol("wants2To3Args");
const resSchema = JsonSchema.arraySchema([Map, Number, Boolean], t => t);

const errSchema = new Schemas()
    .addSpec(wants2Args, {
        description: getDesc => (t1, t2) => `the description with ${getDesc(t1)} and ${getDesc(t2)}`,
        load: (_t1, _t2) => resSchema
    })
    .addSpec(justAString, {
        description: "Just a string",
    })
    .addSpec(wantsNoArgs, {
        description: _ => () => "wanted no args",
        load: () => JsonSchema.booleanSchema(x => x)
    })
    .addSpec(wants2To3Args, {
        maxArgs: 3,
        description: getDesc => (t1, t2, t3 = AnyTy) => `${getDesc(t1)} and ${getDesc(t2)} and ${getDesc(t3)}`,
        load: (_t1, _t2, _t3 = AnyTy) => JsonSchema.booleanSchema(x => x)
    })

function testWrongNumberOfSpecArguments(desc: string, f: () => any, spec: TySpec, numActual: number, expected: string): Test {
    return new Test(desc, () => {
        const err = assertThrows(f, Schemas.WrongNumberOfArgumentsError);
        assertEquals(err.message, `The specification ${Schemas._getDescriptionBase(spec)} was given ${numActual} argument${numActual === 1 ? '' : 's'}, but expected ${expected}`);
    });
}

function testWrongNumberOfDescriptionSpecArguments(desc: string, spec: TySpec, specExpected: TySpec, numActual: number, expected: string): Test {
    return testWrongNumberOfSpecArguments(desc, () => errSchema.getDescription(spec), specExpected, numActual, expected);
}

function testWrongNumberOfSchemaSpecArguments(desc: string, spec: TySpec, specExpected: TySpec, numActual: number, expected: string): Test {
    return testWrongNumberOfSpecArguments(desc, () => errSchema.getSchemaForSpec(spec), specExpected, numActual, expected);
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
            testGroup("wants2Args",
                testWrongNumberOfDescriptionSpecArguments("0 instead of 2", wants2Args, wants2Args, 0, 'exactly 2'),
                testWrongNumberOfDescriptionSpecArguments("1 instead of 2", [wants2Args, Number], wants2Args, 1, 'exactly 2'),
            ),
            testWrongNumberOfDescriptionSpecArguments("wants2To3Args: 1 instead of 2", [wants2To3Args, Number], wants2To3Args, 1, 'at least 2 and at most 3'),
        ),
        testGroup("correct number of spec arguments",
            testGroup("justAString",
                testGetDescriptionOkay("0 args", justAString, "Just a string"),
                testGetDescriptionOkay("1 arg", [justAString, Number], "Just a string"),
            ),
            testGetDescriptionOkay("wants2Args: 2 args", [wants2Args, Number, Boolean], "the description with Number and Boolean"),
            testGetDescriptionOkay("wantsNoArgs: 0 args", wantsNoArgs, "wanted no args"),
            testGroup("wants2To3Args",
                testGetDescriptionOkay("2 args", [wants2To3Args, Number, Boolean], "Number and Boolean and Symbol(AnyTy)"),
                testGetDescriptionOkay("3 args", [wants2To3Args, Number, Boolean, String], "Number and Boolean and String"),
            ),
        ),
        testGroup("too many spec arguments",
            testWrongNumberOfDescriptionSpecArguments("3 instead of 2", [wants2Args, Number, Boolean, String], wants2Args, 3, 'exactly 2'),
            testWrongNumberOfDescriptionSpecArguments("1 instead of 0", [wantsNoArgs, Number], wantsNoArgs, 1, 'exactly 0'),
            testWrongNumberOfDescriptionSpecArguments("4 instead of 3", [wants2To3Args, Number, Boolean, String, null], wants2To3Args, 4, 'at least 2 and at most 3'),
        ),
    ),
    testGroup("getSchemaForSpec",
        testGroup("too few spec arguments",
            testGroup("wants2Args",
                testWrongNumberOfSchemaSpecArguments("0 instead of 2", wants2Args, wants2Args, 0, 'exactly 2'),
                testWrongNumberOfSchemaSpecArguments("1 instead of 2", [wants2Args, Number], wants2Args, 1, 'exactly 2'),
            ),
            testWrongNumberOfSchemaSpecArguments("wants2To3Args: 1 instead of 2", [wants2To3Args, Number], wants2To3Args, 1, 'at least 2 and at most 3'),
        ),
        testGetSchemaOkay("correct number of spec arguments", [wants2Args, Number, Boolean], resSchema),
        testGroup("too many spec arguments",
            testWrongNumberOfSchemaSpecArguments("1 instead of 0", [wantsNoArgs, Number], wantsNoArgs, 1, 'exactly 0'),
            testWrongNumberOfSchemaSpecArguments("3 instead of 2", [wants2Args, Number, Boolean, String], wants2Args, 3, 'exactly 2'),
            testWrongNumberOfSchemaSpecArguments("4 instead of 3", [wants2To3Args, Number, Boolean, String, null], wants2To3Args, 4, 'at least 2 and at most 3'),
        ),
    ),
).runAsMain();
