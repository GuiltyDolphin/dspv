import { Either, Maybe } from './deps.ts';

enum JsonType {
    ARRAY = "ARRAY",
    BOOLEAN = "BOOLEAN",
    NULL = "NULL",
    NUMBER = "NUMBER",
    OBJECT = "OBJECT",
    STRING = "STRING"
}

export abstract class JsonValue {
    protected value: any;
    protected ty: JsonType;

    constructor(value: any, ty: JsonType) {
        this.value = value;
        this.ty = ty;
    }

    getType(): JsonType {
        return this.ty;
    }

    _unwrap(): any {
        return this.value;
    }
}

export class JsonArray extends JsonValue {
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

export class JsonBoolean extends JsonValue {
    constructor(x: boolean) {
        super(x, JsonType.BOOLEAN);
    }

    unwrap(): Boolean {
        return this.value;
    }
}

export class JsonNull extends JsonValue {
    constructor() {
        super(null, JsonType.NULL);
    }

    unwrap(): null {
        return null;
    }
}

export class JsonNumber extends JsonValue {
    constructor(x: number) {
        super(x, JsonType.NUMBER);
    }

    unwrap(): number {
        return this.value;
    }
}

export class JsonObject extends JsonValue {
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

export class JsonString extends JsonValue {
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

    constructor(schemas?: Schemas) {
        if (schemas === undefined) {
            schemas = new Map();
        }
        this.schemas = schemas;
    }

    /** Parse the JSON text as a member of the given type. */
    loadAs<T>(jv: JsonValue, cls: PTy): JsonParseResult<JsonJSType<T>> {
        const typeError: (d: string) => JsonParseResult<JsonJSType<T>> = (desc: string) => {
            return JsonParser.failParse(new JsonParser.JsonTypeError(desc, jv._unwrap()));
        };

        if (this.schemas.get(cls) !== undefined) {
            const schema = this.schemas.get(cls) as JsonSchema<T>;
            if (jv instanceof JsonObject) {
                return schema.onObject(this, jv);
            }
            return typeError(schema.getDescription());
        }
        if (cls === Array) {
            return this.loadAs(jv, [Array, AnyTy]);
        }
        if (cls === Object) {
            return this.loadAs(jv, [Object, AnyTy]);
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
        if (cls === Boolean) {
            if (jv instanceof JsonBoolean) {
                return JsonParser.parseOk(jv.unwrap());
            }
            return typeError('boolean');
        }
        if (cls === null) {
            if (jv instanceof JsonNull) {
                return JsonParser.parseOk(jv.unwrap());
            }
            return typeError('null');
        }
        if (cls === Number) {
            if (jv instanceof JsonNumber) {
                return JsonParser.parseOk(jv.unwrap());
            }
            return typeError('number');
        }
        if (cls === String) {
            if (jv instanceof JsonString) {
                return JsonParser.parseOk(jv.unwrap());
            }
            return typeError('string');
        }
        throw new Error(`NOT IMPLEMENTED: with value ${jv} on class ` + String(cls));
    }

    /**
     * Parse the JSON text as a member of the given type.
     *
     * Similar to {@link parseAs}, but throw any resulting exception immediately.
     */
    parseAsOrThrow(text: string, cls: AnyTyTy): any;
    parseAsOrThrow(text: string, cls: BooleanConstructor): Boolean;
    parseAsOrThrow(text: string, cls: NumberConstructor): Number;
    parseAsOrThrow(text: string, cls: StringConstructor): String;
    parseAsOrThrow(text: string, cls: ArrayConstructor): Array<unknown>;
    parseAsOrThrow(text: string, cls: [ArrayConstructor, PTy]): Array<unknown>;
    parseAsOrThrow(text: string, cls: ObjectConstructor): Object;
    parseAsOrThrow(text: string, cls: [ObjectConstructor, PTy]): Object;
    parseAsOrThrow(text: string, cls: null): null;
    parseAsOrThrow<T>(text: string, cls: GenConstructor<T>): T;
    parseAsOrThrow<T>(text: string, cls: PTy | GenConstructor<T>) {
        return parse(text).mapCollecting(v => this.loadAs(v, cls)).either(err => { throw err }, r => r);
    }

    /** Parse the JSON text as a member of the given type. */
    parseAs(text: string, cls: AnyTyTy): JsonParseResult<any>;
    parseAs(text: string, cls: BooleanConstructor): JsonParseResult<Boolean>;
    parseAs(text: string, cls: NumberConstructor): JsonParseResult<Number>;
    parseAs(text: string, cls: StringConstructor): JsonParseResult<String>;
    parseAs(text: string, cls: ArrayConstructor): JsonParseResult<Array<unknown>>;
    parseAs(text: string, cls: [ArrayConstructor, PTy]): JsonParseResult<Array<unknown>>;
    parseAs(text: string, cls: ObjectConstructor): JsonParseResult<Object>;
    parseAs(text: string, cls: [ObjectConstructor, PTy]): JsonParseResult<Object>;
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
        private value: any;

        constructor(expected: string, value: any) {
            super(`expected: ${expected}\nbut got: ${String(value)}`);
            this.expected = expected;
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

/** Schema that specifies how to load a specific class from JSON. */
export class JsonSchema<T> {
    private objectParser: { onObject: (parser: JsonParser, json: JsonObject) => JsonParseResult<T> };
    private description: string;

    constructor(description: string, objectParser: { onObject: (parser: JsonParser, json: JsonObject) => JsonParseResult<T> }) {
        this.objectParser = objectParser;
        this.description = description;
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

    /** Get a human-readable description of what the schema parses. */
    getDescription() {
        return this.description;
    };

    onObject(parser: JsonParser, o: JsonObject): JsonParseResult<T> {
        return this.objectParser.onObject(parser, o);
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

type JsonJSType<T> = JsonJSType<T>[] | Boolean | null | Number | String | T;

type PTy = BooleanConstructor | NumberConstructor | StringConstructor | null | Constructor | [ArrayConstructor, PTy] | [ObjectConstructor, PTy] | AnyTyTy

type Schemas = Map<PTy, JsonSchema<any>>;
