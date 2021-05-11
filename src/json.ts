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

export module JsonParser {

    export function failParse<T>(err: JsonParseError): JsonParseResult<T> {
        return Either.fail(err);
    }

    export function parseOk<T>(x: T): JsonParseResult<T> {
        return Either.pure(x);
    }

    export class FieldTypeMismatch extends JsonParseError {
        constructor(message: string) {
            super(message);
        }
    }

    export class JsonTypeError extends JsonParseError {
        private expected: string;
        private value: any;

        constructor(expected: string, value: any) {
            super(`expected: ${expected}\nbut got: ${String(value)}`);
            this.expected = expected;
            this.value = value;
        }
    }

    export class MissingKeysError extends JsonParseError {
        private keys: string[];

        constructor(keys: string[]) {
            super('missing keys: ' + keys.join(', '));
            this.keys = keys;
        }
    }

    export class UnknownKeysError extends JsonParseError {
        private keys: string[];

        constructor(keys: string[]) {
            super('unknown keys: ' + keys.join(', '));
            this.keys = keys;
        }
    }
}

/** Schema that specifies how to load a specific class from JSON. */
export class JsonSchema<T> {
    private parser: { onObject: (json: JsonObject, schemas: Schemas) => JsonParseResult<T> };
    private description: string;

    constructor(description: string, parser: { onObject: (json: JsonObject, schemas: Schemas) => JsonParseResult<T> }) {
        this.parser = parser;
        this.description = description;
    }

    static objectSchema<T>(desc: string, ks: { [k: string]: PTy }, onRes: (x: { [k: string]: any }) => T): JsonSchema<T> {
        return new JsonSchema(desc, new (class {
            onObject(json: JsonObject, schemas: Schemas): JsonParseResult<T> {
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
                            const v = loadAs(kv, ks[ksk], schemas);
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
        })());
    }

    /** Get a human-readable description of what the schema parses. */
    getDescription() {
        return this.description;
    };

    onObject(o: JsonObject, schemas: Schemas): JsonParseResult<T> {
        return this.parser.onObject(o, schemas);
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

/** Parse the JSON text as a member of the given type. */
function loadAs<T>(jv: JsonValue, cls: PTy, schemas: Schemas): JsonParseResult<JsonJSType<T>> {
    const typeError: (d: string) => JsonParseResult<JsonJSType<T>> = (desc: string) => {
        return JsonParser.failParse(new JsonParser.JsonTypeError(desc, jv._unwrap()));
    };

    if (schemas.get(cls) !== undefined) {
        const schema = schemas.get(cls) as JsonSchema<T>;
        if (jv instanceof JsonObject) {
            return schema.onObject(jv, schemas);
        }
        return typeError(schema.getDescription());
    }
    if (cls === Array) {
        return loadAs(jv, [Array, AnyTy], schemas);
    }
    if (cls === Object) {
        return loadAs(jv, [Object, AnyTy], schemas);
    }
    if (cls === AnyTy) {
        if (jv instanceof JsonArray) {
            return loadAs(jv, [Array, AnyTy], schemas);
        } else if (jv instanceof JsonObject) {
            return loadAs(jv, [Object, AnyTy], schemas);
        } else {
            return JsonParser.parseOk(jv._unwrap());
        }
    }
    if (cls instanceof Array) {
        if (cls[0] === Array) {
            if (jv instanceof JsonArray) {
                const arr: Array<JsonValue> = (jv as JsonArray).unwrap();
                return Either.catEithers(arr.map(x => loadAs(x, cls[1] as PTy, schemas)));
            }
            return typeError('array');
        }
        if (cls[0] === Object) {
            if (jv instanceof JsonObject) {
                const o = (jv as JsonObject).unwrap();
                const res: any = new Object();
                for (const [k, _] of o) {
                    const r = loadAs(o.get(k) as JsonValue, cls[1], schemas);
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
export function parseAsOrThrow(text: string, cls: AnyTyTy, schemas?: Schemas): any;
export function parseAsOrThrow(text: string, cls: BooleanConstructor, schemas?: Schemas): Boolean;
export function parseAsOrThrow(text: string, cls: NumberConstructor, schemas?: Schemas): Number;
export function parseAsOrThrow(text: string, cls: StringConstructor, schemas?: Schemas): String;
export function parseAsOrThrow(text: string, cls: ArrayConstructor, schemas?: Schemas): Array<unknown>;
export function parseAsOrThrow(text: string, cls: [ArrayConstructor, PTy], schemas?: Schemas): Array<unknown>;
export function parseAsOrThrow(text: string, cls: ObjectConstructor, schemas?: Schemas): Object;
export function parseAsOrThrow(text: string, cls: [ObjectConstructor, PTy], schemas?: Schemas): Object;
export function parseAsOrThrow(text: string, cls: null, schemas?: Schemas): null;
export function parseAsOrThrow<T>(text: string, cls: GenConstructor<T>, schemas?: Schemas): T;
export function parseAsOrThrow<T>(text: string, cls: PTy | GenConstructor<T>, schemas?: Schemas) {
    if (schemas === undefined) {
        schemas = new Map();
    }
    return parse(text).mapCollecting(v => loadAs(v, cls, schemas as Schemas)).either(err => { throw err }, r => r);
}

/** Parse the JSON text as a member of the given type. */
export function parseAs(text: string, cls: AnyTyTy, schemas?: Schemas): JsonParseResult<any>;
export function parseAs(text: string, cls: BooleanConstructor, schemas?: Schemas): JsonParseResult<Boolean>;
export function parseAs(text: string, cls: NumberConstructor, schemas?: Schemas): JsonParseResult<Number>;
export function parseAs(text: string, cls: StringConstructor, schemas?: Schemas): JsonParseResult<String>;
export function parseAs(text: string, cls: ArrayConstructor, schemas?: Schemas): JsonParseResult<Array<unknown>>;
export function parseAs(text: string, cls: [ArrayConstructor, PTy], schemas?: Schemas): JsonParseResult<Array<unknown>>;
export function parseAs(text: string, cls: ObjectConstructor, schemas?: Schemas): JsonParseResult<Object>;
export function parseAs(text: string, cls: [ObjectConstructor, PTy], schemas?: Schemas): JsonParseResult<Object>;
export function parseAs(text: string, cls: null, schemas?: Schemas): JsonParseResult<null>;
export function parseAs<T>(text: string, cls: GenConstructor<T>, schemas?: Schemas): JsonParseResult<T>;
export function parseAs<T>(text: string, cls: PTy | GenConstructor<T>, schemas?: Schemas) {
    if (schemas === undefined) {
        schemas = new Map();
    }
    return parse(text).mapCollecting(v => loadAs(v, cls, schemas as Schemas));
}
