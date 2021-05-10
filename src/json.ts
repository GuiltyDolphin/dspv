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
        for (var i = 0; i < x.length; i++) {
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
        // todo: this might not work on Internet Explorer 10 and below (2021-05-10)
        Object.setPrototypeOf(this, JsonParseError.prototype);
    }
}

type JsonParseResult<T> = Either<JsonParseError, T>;

export class JsonParser {
    static failParse<T>(msg: string): JsonParseResult<T> {
        return Either.fail(new JsonParseError(msg));
    }

    static parseOk<T>(x: T): JsonParseResult<T> {
        return Either.pure(x);
    }
}

/** Schema that specifies how to load a specific class from JSON. */
export class JsonSchema<T> {
    private parser: { onObject: (json: JsonObject) => JsonParseResult<T> };
    private description: string;

    constructor(description: string, parser: { onObject: (json: JsonObject) => JsonParseResult<T> }) {
        this.parser = parser;
        this.description = description;
    }

    static objectSchema<T>(desc: string, ks: { [k: string]: PTy }, onRes: (x: { [k: string]: any }) => T): JsonSchema<T> {
        return new JsonSchema(desc, new (class {
            onObject(json: JsonObject): JsonParseResult<T> {
                const unreadKeys = new Set<string>();
                const missedKeys = new Set<string>();
                for (const ksk in ks) {
                    missedKeys.add(ksk);
                }
                const res = new Map<string, any>();
                Array.from(json.keys()).map(k => {
                    for (const ksk in ks) {
                        if (ksk == k) {
                            missedKeys.delete(ksk);
                            const v = loadAs(json.get(k).unwrap(), ks[ksk]);
                            if (v.isLeft()) {
                                return v.propLeft();
                            }
                            res.set(k, v.unwrapRight());
                        } else {
                            unreadKeys.add(k);
                        }
                    }
                });
                if (unreadKeys.size > 0) {
                    return JsonParser.failParse('unknown keys: ' + Array.from(unreadKeys.values()).join(', '));
                }
                if (missedKeys.size > 0) {
                    return JsonParser.failParse('missing keys: ' + Array.from(missedKeys.values()).join(', '));
                }
                return JsonParser.parseOk(onRes(res));
            }
        })());
    }

    /** Get a human-readable description of what the schema parses. */
    getDescription() {
        return this.description;
    };

    onObject(o: JsonObject): JsonParseResult<T> {
        return this.parser.onObject(o);
    }
}

interface Constructor {
    new(...args: any[]): any;
}

/** Represents values that can take any type. */
export const AnyTy = Symbol("AnyTy");
type AnyTyTy = typeof AnyTy;

type JsonJSType<T> = JsonJSType<T>[] | Boolean | null | Number | String | T;

type PTy = BooleanConstructor | NumberConstructor | StringConstructor | null | Constructor | [ArrayConstructor, PTy] | [ObjectConstructor, PTy] | AnyTyTy

/** Parse the JSON text as a member of the given type. */
function loadAs<T>(jv: JsonValue, cls: PTy | JsonSchema<T>): JsonParseResult<JsonJSType<T>> {
    if (cls === Array) {
        return loadAs(jv, [Array, AnyTy]);
    }
    if (cls === Object) {
        return loadAs(jv, [Object, AnyTy]);
    }
    if (cls === AnyTy) {
        if (jv instanceof JsonArray) {
            return loadAs(jv, [Array, AnyTy]);
        } else if (jv instanceof JsonObject) {
            return loadAs(jv, [Object, AnyTy]);
        } else {
            return JsonParser.parseOk(jv._unwrap());
        }
    }
    if (cls instanceof Array) {
        if (cls[0] === Array) {
            if (jv instanceof JsonArray) {
                const arr: Array<JsonValue> = (jv as JsonArray).unwrap();
                return Either.catEithers(arr.map(x => loadAs(x, cls[1] as PTy)));
            }
            throw new Error("expected an array but got a different value");
        }
        if (cls[0] === Object) {
            if (jv instanceof JsonObject) {
                const o = (jv as JsonObject).unwrap();
                const res: any = new Object();
                for (const [k, _] of o) {
                    const r = loadAs(o.get(k) as JsonValue, cls[1]);
                    if (r.isLeft()) {
                        return r.propLeft();
                    } else {
                        res[k] = r.unwrapRight();
                    }
                };
                return JsonParser.parseOk(res);
            }
            throw new Error("expected an object but got a different value");
        }
    }
    if (cls === Boolean) {
        if (jv instanceof JsonBoolean) {
            return JsonParser.parseOk(jv.unwrap());
        }
        throw new Error("expected a boolean but got a different value");
    }
    if (cls === null) {
        if (jv instanceof JsonNull) {
            return JsonParser.parseOk(jv.unwrap());
        }
        throw new Error("expected null but got a different value");
    }
    if (cls === Number) {
        if (jv instanceof JsonNumber) {
            return JsonParser.parseOk(jv.unwrap());
        }
        throw new Error("expected a number but got a different value");
    }
    if (cls === String) {
        if (jv instanceof JsonString) {
            return JsonParser.parseOk(jv.unwrap());
        }
        throw new Error("expected a string but got a different value");
    }
    if (cls instanceof JsonSchema) {
        if (jv instanceof JsonObject) {
            return cls.onObject(jv);
        }
        throw new Error(`expected something that matches ${cls.getDescription()} but got a different value`);
    }
    throw new Error(`NOT IMPLEMENTED: with value ${jv} on class ` + String(cls));
}

/** Parse the JSON text as a member of the given type. */
export function parseAs(text: string, cls: AnyTyTy): any;
export function parseAs(text: string, cls: BooleanConstructor): Boolean;
export function parseAs(text: string, cls: NumberConstructor): Number;
export function parseAs(text: string, cls: StringConstructor): String;
export function parseAs(text: string, cls: ArrayConstructor): Array<unknown>;
export function parseAs(text: string, cls: [ArrayConstructor, PTy]): Array<unknown>;
export function parseAs(text: string, cls: ObjectConstructor): Object;
export function parseAs(text: string, cls: [ObjectConstructor, PTy]): Object;
export function parseAs(text: string, cls: null): null;
export function parseAs<T>(text: string, cls: JsonSchema<T>): T;
export function parseAs<T>(text: string, cls: PTy | JsonSchema<T>) {
    return parse(text).mapCollecting(v => loadAs(v, cls)).either(err => { throw err }, r => r);
}
