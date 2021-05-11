import { Either, Maybe } from './deps.ts';

enum JsonType {
    ARRAY = "ARRAY",
    BOOLEAN = "BOOLEAN",
    NULL = "NULL",
    NUMBER = "NUMBER",
    OBJECT = "OBJECT",
    STRING = "STRING"
}

/** Types that are directly JSON compatible. */
type JsonCompatTy = JsonCompatTy[] | boolean | null | number | { [k: string]: JsonCompatTy } | string;

type JsonJSType<T> = JsonJSType<T>[] | JsonCompatTy | { [k: string]: JsonJSType<T> } | T;

abstract class GenJsonValue<T extends JsonCompatTy> {
    protected value: any;
    protected ty: JsonType;

    constructor(value: any, ty: JsonType) {
        this.value = value;
        this.ty = ty;
    }

    getType(): JsonType {
        return this.ty;
    }

    _unwrap(): T {
        return this.value;
    }
}

type JsonValue = GenJsonValue<JsonCompatTy>;

class JsonArray extends GenJsonValue<JsonCompatTy[]> {
    arr: JsonValue[];

    constructor(...x: JsonValue[]) {
        const a = x;
        super(a, JsonType.ARRAY);
        this.arr = a;
    }

    size(): number {
        return this.arr.length;
    }

    get(i: number) {
        return this.arr[i];
    }

    set(i: number, v: JsonValue) {
        this.arr[i] = v;
    }

    unwrap(): JsonValue[] {
        return this.arr;
    }
}

class JsonBoolean extends GenJsonValue<boolean> {
    constructor(x: boolean) {
        super(x, JsonType.BOOLEAN);
    }

    unwrap(): boolean {
        return this.value;
    }
}

class JsonNull extends GenJsonValue<null> {
    constructor() {
        super(null, JsonType.NULL);
    }

    unwrap(): null {
        return null;
    }
}

class JsonNumber extends GenJsonValue<number> {
    constructor(x: number) {
        super(x, JsonType.NUMBER);
    }

    unwrap(): number {
        return this.value;
    }
}

class JsonObject extends GenJsonValue<{ [k: string]: JsonCompatTy }> {
    private map: Map<string, JsonValue>;

    constructor() {
        const m = new Map<string, JsonValue>();
        super(m, JsonType.OBJECT);
        this.map = m;
    }

    get(k: string): Maybe<JsonValue> {
        if (this.map.has(k)) {
            const v: any = this.map.get(k);
            return Maybe.some(v);
        }
        return Maybe.none();
    }

    set(k: string, v: JsonValue) {
        return this.map.set(k, v);
    }

    asMap(): Map<string, JsonValue> {
        return this.map;
    }

    keys(): Set<string> {
        return new Set<string>(this.map.keys());
    }

    unwrap(): Map<string, JsonValue> {
        return this.map;
    }
}

class JsonString extends GenJsonValue<string> {
    constructor(x: string) {
        super(x, JsonType.STRING);
    }

    unwrap(): string {
        return this._unwrap();
    }
}

export function toJsonValue(x: any): Either<string, JsonValue> {
    const pure = Either.pure;
    const fail = Either.fail;
    if (typeof x == 'string') {
        return pure(new JsonString(x));
    } else if (typeof x == 'boolean') {
        return pure(new JsonBoolean(x));
    } else if (typeof x == 'number') {
        return pure(new JsonNumber(x));
    } else if (x === null) {
        return pure(new JsonNull());
    } else if (x instanceof Array) {
        const res = new JsonArray();
        for (let i = 0; i < x.length; i++) {
            const ijson = toJsonValue(x[i]);
            if (ijson.isLeft()) {
                return ijson.propLeft();
            }
            res.set(i, ijson.unwrapRight());
        }
        return pure(res);
    } else if (typeof x == 'function') {
        return fail('functions not supported by JSON');
    } else if (typeof x == 'object') {
        const res = new JsonObject();
        for (const k in x) {
            const kjson = toJsonValue(x[k]);
            if (kjson.isLeft()) {
                return kjson.propLeft();
            }
            res.set(k, kjson.unwrapRight());
        }
        return pure(res);
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
            return JsonParser.failParse(new JsonParser.JsonTypeError(desc, 'unknown', jv._unwrap()));
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
            if (jv instanceof JsonArray) {
                return this.loadAs(jv, [Array, AnyTy]);
            } else if (jv instanceof JsonObject) {
                return this.loadAs(jv, [Object, AnyTy]);
            } else {
                return JsonParser.parseOk(jv._unwrap());
            }
        }
        if (cls instanceof Array) {
            if (cls[0] === Array) {
                if (jv instanceof JsonArray) {
                    const arr: Array<JsonValue> = (jv as JsonArray).unwrap();
                    return Either.catEithers(arr.map(x => this.loadAs(x, cls[1] as PTy)));
                }
                return typeError('array');
            }
            if (cls[0] === Object) {
                if (jv instanceof JsonObject) {
                    const o = (jv as JsonObject).unwrap();
                    const res: any = new Object();
                    for (const [k, _] of o) {
                        const r = this.loadAs(o.get(k) as JsonValue, cls[1]);
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
    parseAsOrThrow(text: string, cls: AnyTyTy): any;
    parseAsOrThrow(text: string, cls: BooleanConstructor): boolean;
    parseAsOrThrow(text: string, cls: NumberConstructor): number;
    parseAsOrThrow(text: string, cls: StringConstructor): string;
    parseAsOrThrow(text: string, cls: ArrayConstructor): JsonCompatTy[];
    parseAsOrThrow(text: string, cls: [ArrayConstructor, PTy]): JsonCompatTy[];
    parseAsOrThrow(text: string, cls: ObjectConstructor): StringKeyed<JsonCompatTy>;
    parseAsOrThrow(text: string, cls: [ObjectConstructor, PTy]): StringKeyed<JsonCompatTy>;
    parseAsOrThrow(text: string, cls: null): null;
    parseAsOrThrow<T>(text: string, cls: GenConstructor<T>): T;
    parseAsOrThrow<T>(text: string, cls: PTy | GenConstructor<T>) {
        return parse(text).mapCollecting(v => this.loadAs(v, cls)).either(err => { throw err }, r => r);
    }

    /** Parse the JSON text as a member of the given type. */
    parseAs(text: string, cls: AnyTyTy): JsonParseResult<any>;
    parseAs(text: string, cls: BooleanConstructor): JsonParseResult<boolean>;
    parseAs(text: string, cls: NumberConstructor): JsonParseResult<number>;
    parseAs(text: string, cls: StringConstructor): JsonParseResult<string>;
    parseAs(text: string, cls: ArrayConstructor): JsonParseResult<JsonCompatTy[]>;
    parseAs(text: string, cls: [ArrayConstructor, PTy]): JsonParseResult<JsonCompatTy[]>;
    parseAs(text: string, cls: ObjectConstructor): JsonParseResult<StringKeyed<JsonCompatTy>>;
    parseAs(text: string, cls: [ObjectConstructor, PTy]): JsonParseResult<StringKeyed<JsonCompatTy>>;
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
        const failWith: <O extends GenJsonValue<JsonCompatTy>>(tyDesc: string) => (_parser: JsonParser, o: O) => JsonParseResult<T> = <O extends GenJsonValue<JsonCompatTy>>(tyDesc: string) => {
            return (_parser: JsonParser, o: O) => {
                return JsonParser.failParse(new JsonParser.JsonTypeError(this.getDescription(), tyDesc, String(o._unwrap())));
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
                for (const [k, kv] of json.asMap()) {
                    unreadKeys.add(k);
                    for (const ksk in ks) {
                        if (ksk == k) {
                            unreadKeys.delete(k);
                            missedKeys.delete(ksk);
                            const v = parser.loadAs(kv, ks[ksk]);
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
        if (o instanceof JsonArray) {
            return this.objectParser.onArray(parser, o);
        }
        if (o instanceof JsonBoolean) {
            return this.objectParser.onBoolean(parser, o);
        }
        if (o instanceof JsonNull) {
            return this.objectParser.onNull(parser, o);
        }
        if (o instanceof JsonNumber) {
            return this.objectParser.onNumber(parser, o);
        }
        if (o instanceof JsonObject) {
            return this.objectParser.onObject(parser, o);
        }
        if (o instanceof JsonString) {
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
