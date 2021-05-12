import { Either, Maybe } from './deps.ts';

type GenJsonType<T> = {
    "array": T[],
    "boolean": boolean,
    "null": null,
    "number": number,
    "object": { [k: string]: T },
    "string": string
}

/**
 * Possible types for a JSON value.
 *
 * Here, elements of arrays and values of objects are themselves JSON values.
 */
type JsonType = GenJsonType<JsonValue>;

/** Types that are directly JSON compatible. */
type JsonValueRaw = JsonValueRaw[] | boolean | null | number | { [k: string]: JsonValueRaw } | string;

type JsonJSType<T> = JsonJSType<T>[] | JsonType[keyof JsonType] | { [k: string]: JsonJSType<T> } | T;

type JsonTypeName = keyof JsonType;

class GenJsonValue<T extends JsonTypeName> {
    private value: JsonType[T];
    protected ty: T;

    constructor(value: JsonType[T], ty: T) {
        this.value = value;
        this.ty = ty;
    }

    getType(): JsonTypeName {
        return this.ty;
    }

    unwrap(): JsonType[T] {
        return this.value;
    }

    isArray(): this is GenJsonValue<"array"> {
        return this.getType() === "array";
    }

    isBoolean(): this is GenJsonValue<"boolean"> {
        return this.getType() === "boolean";
    }

    isNull(): this is GenJsonValue<"null"> {
        return this.getType() === "null";
    }

    isNumber(): this is GenJsonValue<"number"> {
        return this.getType() === "number";
    }

    isObject(): this is GenJsonValue<"object"> {
        return this.getType() === "object";
    }

    isString(): this is GenJsonValue<"string"> {
        return this.getType() === "string";
    }

    unwrapFully(): JsonValueRaw {
        if (this.isArray()) {
            return this.value.map(v => v.unwrapFully());
        } else if (this.isBoolean()) {
            return this.value;
        } else if (this.isNull()) {
            return this.value;
        } else if (this.isNumber()) {
            return this.value;
        } else if (this.isObject()) {
            const res: { [k: string]: JsonValueRaw } = {};
            const v = this.value;
            for (const k in v) {
                res[k] = v[k].unwrapFully();
            }
            return res;
        } else if (this.isString()) {
            return this.value;
        } else {
            throw new Error("unreachable");
        }
    }

    static jsonArray(xs: JsonValue[]): JsonArray {
        return new GenJsonValue(xs, "array");
    }

    static jsonBoolean(b: boolean): JsonBoolean {
        return new GenJsonValue(b, "boolean");
    }

    static jsonNull(): JsonNull {
        return new GenJsonValue(null, "null");
    }

    static jsonNumber(n: number): JsonNumber {
        return new GenJsonValue(n, "number");
    }

    static jsonObject(o: { [k: string]: JsonValue }): JsonObject {
        return new GenJsonValue(o, "object");
    }

    static jsonString(s: string): JsonString {
        return new GenJsonValue(s, "string");
    }
}


type JsonValue = GenJsonValue<keyof JsonType>;

type JsonArray = GenJsonValue<"array">;

type JsonBoolean = GenJsonValue<"boolean">;

type JsonObject = GenJsonValue<"object">;

type JsonNull = GenJsonValue<"null">;

type JsonNumber = GenJsonValue<"number">;

type JsonString = GenJsonValue<"string">;

export function toJsonValue(x: any): Either<string, JsonValue> {
    const pure = Either.pure;
    const fail = Either.fail;
    if (typeof x == 'string') {
        return pure(GenJsonValue.jsonString(x));
    } else if (typeof x == 'boolean') {
        return pure(GenJsonValue.jsonBoolean(x));
    } else if (typeof x == 'number') {
        return pure(GenJsonValue.jsonNumber(x));
    } else if (x === null) {
        return pure(GenJsonValue.jsonNull());
    } else if (x instanceof Array) {
        const res = [];
        for (let i = 0; i < x.length; i++) {
            const ijson = toJsonValue(x[i]);
            if (ijson.isLeft()) {
                return ijson.propLeft();
            }
            res[i] = ijson.unwrapRight();
        }
        return pure(GenJsonValue.jsonArray(res));
    } else if (typeof x == 'function') {
        return fail('functions not supported by JSON');
    } else if (typeof x == 'object') {
        const res: { [k: string]: JsonValue } = {};
        for (const k in x) {
            const kjson = toJsonValue(x[k]);
            if (kjson.isLeft()) {
                return kjson.propLeft();
            }
            res[k] = kjson.unwrapRight();
        }
        return pure(GenJsonValue.jsonObject(res));
    }
    return fail(`could not load JSON value: ${x}`);
}

function parse(text: string): Either<string, JsonValue> {
    return toJsonValue(JSON.parse(text));
}

class JsonParseError extends Error {
    constructor(message: string) {
        super(message);
    }
}

export type JsonParseResult<T> = Either<JsonParseError, T>;

export class JsonParser {

    private schemas: Schemas;

    constructor(schemas?: Schemas, noDefault?: boolean) {
        schemas = new Map([...(noDefault ? [] : defaultSchema), ...(schemas !== undefined ? schemas : [])]);
        this.schemas = schemas;
    }

    /** Parse the JSON text as a member of the given type. */
    loadAs<T>(jv: JsonValue, cls: PTy): JsonParseResult<JsonJSType<T>> {
        const typeError: (d: string) => JsonParseResult<JsonJSType<T>> = (desc: string) => {
            return JsonParser.failParse(new JsonParser.JsonTypeError(desc, 'unknown', jv.unwrapFully()));
        };

        if (this.schemas.get(cls) !== undefined) {
            const schema = this.schemas.get(cls);
            if (schema instanceof JsonSchema) {
                return (schema as JsonSchema<T>).on(this, jv);
            } else {
                return this.loadAs(jv, schema as PTy);
            }
        }
        if (cls === AnyTy) {
            if (jv.isArray()) {
                return this.loadAs(jv, [Array, AnyTy]);
            } else if (jv.isObject()) {
                return this.loadAs(jv, [Object, AnyTy]);
            } else {
                return JsonParser.parseOk(jv.unwrapFully());
            }
        }
        if (cls instanceof Array) {
            if (cls[0] === Array) {
                if (jv.isArray()) {
                    const arr: Array<JsonValue> = jv.unwrap();
                    return Either.catEithers(arr.map(x => this.loadAs(x, cls[1] as PTy)));
                }
                return typeError('array');
            }
            if (cls[0] === Object) {
                if (jv.isObject()) {
                    const o = jv.unwrap();
                    const res: any = new Object();
                    for (const k in o) {
                        const r = this.loadAs(o[k], cls[1]);
                        if (r.isLeft()) {
                            return r.propLeft();
                        } else {
                            res[k] = r.unwrapRight();
                        }
                    };
                    return JsonParser.parseOk(res);
                }
                return typeError('object');
            }
        }
        throw new Error(`NOT IMPLEMENTED: with value ${jv} on class ` + String(cls));
    }

    /**
     * Parse the JSON text as a member of the given type.
     *
     * Similar to {@link parseAs}, but throw any resulting exception immediately.
     */
    parseAsOrThrow(text: string, cls: AnyTyTy): JsonValueRaw;
    parseAsOrThrow(text: string, cls: BooleanConstructor): boolean;
    parseAsOrThrow(text: string, cls: NumberConstructor): number;
    parseAsOrThrow(text: string, cls: StringConstructor): string;
    parseAsOrThrow(text: string, cls: null): null;
    parseAsOrThrow(text: string, cls: ArrayConstructor): JsonValueRaw[];
    parseAsOrThrow(text: string, cls: [ArrayConstructor, PTy]): JsonValueRaw[];
    parseAsOrThrow(text: string, cls: ObjectConstructor): StringKeyed<JsonValueRaw>;
    parseAsOrThrow(text: string, cls: [ObjectConstructor, PTy]): StringKeyed<JsonValueRaw>;
    parseAsOrThrow<T>(text: string, cls: GenConstructor<T>): T;
    parseAsOrThrow<T>(text: string, cls: PTy | GenConstructor<T>) {
        return parse(text).mapCollecting(v => this.loadAs(v, cls)).either(err => { throw err }, r => r);
    }

    /** Parse the JSON text as a member of the given type. */
    parseAs(text: string, cls: AnyTyTy): JsonParseResult<JsonValueRaw>;
    parseAs(text: string, cls: BooleanConstructor): JsonParseResult<boolean>;
    parseAs(text: string, cls: NumberConstructor): JsonParseResult<number>;
    parseAs(text: string, cls: StringConstructor): JsonParseResult<string>;
    parseAs(text: string, cls: ArrayConstructor): JsonParseResult<JsonValueRaw[]>;
    parseAs(text: string, cls: [ArrayConstructor, PTy]): JsonParseResult<JsonValueRaw[]>;
    parseAs(text: string, cls: ObjectConstructor): JsonParseResult<StringKeyed<JsonValueRaw>>;
    parseAs(text: string, cls: [ObjectConstructor, PTy]): JsonParseResult<StringKeyed<JsonValueRaw>>;
    parseAs(text: string, cls: null): JsonParseResult<null>;
    parseAs<T>(text: string, cls: GenConstructor<T>): JsonParseResult<T>;
    parseAs<T>(text: string, cls: PTy | GenConstructor<T>) {
        return parse(text).mapCollecting(v => this.loadAs(v, cls));
    }

    static failParse<T>(err: JsonParseError): JsonParseResult<T> {
        return Either.fail(err);
    }

    static parseOk<T>(x: T): JsonParseResult<T> {
        return Either.pure(x);
    }

    static FieldTypeMismatch = class extends JsonParseError {
        constructor(message: string) {
            super(message);
        }
    }

    static JsonTypeError = class extends JsonParseError {
        private expected: string;
        private actualTy: string;
        private value: any;

        constructor(expected: string, actualTy: string, value: any) {
            super(`expected: ${expected}\nbut got: ${actualTy}: ${String(value)}`);
            this.expected = expected;
            this.actualTy = actualTy;
            this.value = value;
        }
    }

    static MissingKeysError = class extends JsonParseError {
        private keys: string[];

        constructor(keys: string[]) {
            super('missing keys: ' + keys.join(', '));
            this.keys = keys;
        }
    }

    static UnknownKeysError = class extends JsonParseError {
        private keys: string[];

        constructor(keys: string[]) {
            super('unknown keys: ' + keys.join(', '));
            this.keys = keys;
        }
    }
}

type StringKeyed<T> = { [k: string]: T };

type JParser<T> = {
    onArray: (parser: JsonParser, json: JsonArray) => JsonParseResult<T>,
    onBoolean: (parser: JsonParser, json: JsonBoolean) => JsonParseResult<T>,
    onNull: (parser: JsonParser, json: JsonNull) => JsonParseResult<T>,
    onNumber: (parser: JsonParser, json: JsonNumber) => JsonParseResult<T>,
    onObject: (parser: JsonParser, json: JsonObject) => JsonParseResult<T>
    onString: (parser: JsonParser, json: JsonString) => JsonParseResult<T>
};

/** Schema that specifies how to load a specific class from JSON. */
export class JsonSchema<T> {
    private objectParser: JParser<T>;
    private description: string;

    constructor(description: string, objectParser: Partial<JParser<T>>) {
        const failWith: <O extends JsonValue>(tyDesc: string) => (_parser: JsonParser, o: O) => JsonParseResult<T> = <O extends JsonValue>(tyDesc: string) => {
            return (_parser: JsonParser, o: O) => {
                return JsonParser.failParse(new JsonParser.JsonTypeError(this.getDescription(), tyDesc, String(o.unwrapFully())));
            };
        };
        this.objectParser = {
            onArray: failWith('array'),
            onBoolean: failWith('boolean'),
            onObject: failWith('object'),
            onNull: failWith('null'),
            onNumber: failWith('number'),
            onString: failWith('string'),
            ...objectParser
        };
        this.description = description;
    }

    static booleanSchema<T>(desc: string, onRes: (x: boolean) => T): JsonSchema<T> {
        return new JsonSchema(desc, {
            onBoolean(_parser: JsonParser, json: JsonBoolean): JsonParseResult<T> {
                return JsonParser.parseOk(onRes(json.unwrap()));
            }
        });
    }

    static nullSchema<T>(desc: string, onRes: (x: null) => T): JsonSchema<T> {
        return new JsonSchema(desc, {
            onNull(_parser: JsonParser, json: JsonNull): JsonParseResult<T> {
                return JsonParser.parseOk(onRes(json.unwrap()));
            }
        });
    }

    static numberSchema<T>(desc: string, onRes: (x: number) => T): JsonSchema<T> {
        return new JsonSchema(desc, {
            onNumber(_parser: JsonParser, json: JsonNumber): JsonParseResult<T> {
                return JsonParser.parseOk(onRes(json.unwrap()));
            }
        });
    }

    static objectSchema<T>(desc: string, ks: StringKeyed<PTy>, onRes: (x: StringKeyed<any>) => T): JsonSchema<T> {
        return new JsonSchema(desc, {
            onObject(parser: JsonParser, json: JsonObject): JsonParseResult<T> {
                const unreadKeys = new Set<string>();
                const missedKeys = new Set<string>();
                for (const ksk in ks) {
                    missedKeys.add(ksk);
                }
                const res = new Map<string, any>();
                const obj = json.unwrap();
                for (const k in obj) {
                    unreadKeys.add(k);
                    for (const ksk in ks) {
                        if (ksk == k) {
                            unreadKeys.delete(k);
                            missedKeys.delete(ksk);
                            const v = parser.loadAs(obj[k], ks[ksk]);
                            if (v.isLeft()) {
                                return v.propLeft();
                            }
                            res.set(k, v.unwrapRight());
                        }
                    }
                }
                if (unreadKeys.size > 0) {
                    return JsonParser.failParse(new JsonParser.UnknownKeysError(Array.from(unreadKeys.values())));
                }
                if (missedKeys.size > 0) {
                    return JsonParser.failParse(new JsonParser.MissingKeysError(Array.from(missedKeys.values())));
                }
                return JsonParser.parseOk(onRes(res));
            }
        });
    }

    static stringSchema<T>(desc: string, onRes: (x: string) => T): JsonSchema<T> {
        return new JsonSchema(desc, {
            onString(_parser: JsonParser, json: JsonString): JsonParseResult<T> {
                return JsonParser.parseOk(onRes(json.unwrap()));
            }
        });
    }

    /** Get a human-readable description of what the schema parses. */
    getDescription() {
        return this.description;
    };

    on(parser: JsonParser, o: JsonValue): JsonParseResult<T> {
        if (o.isArray()) {
            return this.objectParser.onArray(parser, o);
        } else if (o.isBoolean()) {
            return this.objectParser.onBoolean(parser, o);
        } else if (o.isNull()) {
            return this.objectParser.onNull(parser, o);
        } else if (o.isNumber()) {
            return this.objectParser.onNumber(parser, o);
        } else if (o.isObject()) {
            return this.objectParser.onObject(parser, o);
        } else if (o.isString()) {
            return this.objectParser.onString(parser, o);
        }
        throw new Error("fatal: unknown class representing a JSON value: " + String(o.constructor));
    }
}

interface Constructor {
    new(...args: any[]): any;
}

/**
 * Generic constructor.
 *
 * Note that this is different from {@link Constructor} in that new on
 * Boolean does not match GenConstructor<Boolean>, but does match
 * Constructor.
 */
interface GenConstructor<T> {
    new(...args: any[]): T;
}

/** Represents values that can take any type. */
export const AnyTy = Symbol("AnyTy");
type AnyTyTy = typeof AnyTy;

type PTy = BooleanConstructor | NumberConstructor | StringConstructor | null | Constructor | [ArrayConstructor, PTy] | [ObjectConstructor, PTy] | AnyTyTy

type Schemas = Map<PTy, JsonSchema<any> | PTy>;

const defaultSchema: Schemas = new Map<PTy, JsonSchema<any> | PTy>()
    .set(Array, [Array, AnyTy])
    .set(Boolean, JsonSchema.booleanSchema('boolean', x => x))
    .set(null, JsonSchema.nullSchema('null', x => x))
    .set(Number, JsonSchema.numberSchema('number', x => x))
    .set(Object, [Object, AnyTy])
    .set(String, JsonSchema.stringSchema('string', x => x));
