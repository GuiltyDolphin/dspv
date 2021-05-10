import { Either, Maybe } from './deps.ts';

class JsonParseError extends Error {
    constructor(message: string) {
        super(message);
        // todo: this might not work on Internet Explorer 10 and below (2021-05-10)
        Object.setPrototypeOf(this, JsonParseError.prototype);
    }
}

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

    unwrap(): any {
        return this.value;
    }

    unwrapArray(): JsonArray {
        return this.value;
    }

    unwrapBoolean(): JsonBoolean {
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
        return this.unwrap().length;
    }

    get(i: number) {
        return this.arr[i];
    }

    set(i: number, v: JsonValue) {
        this.arr[i] = v;
    }
}

export class JsonBoolean extends JsonValue {
    constructor(x: boolean) {
        super(x, JsonType.BOOLEAN);
    }
}

export class JsonNull extends JsonValue {
    constructor() {
        super(null, JsonType.NULL);
    }
}

export class JsonNumber extends JsonValue {
    constructor(x: number) {
        super(x, JsonType.NUMBER);
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
}

export class JsonString extends JsonValue {
    constructor(x: string) {
        super(x, JsonType.STRING);
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

interface Constructor {
    new(...args: any[]): any;
}

/** Represents values that can take any type. */
export const AnyTy = Symbol("AnyTy");
type AnyTyTy = typeof AnyTy;

type PTy = BooleanConstructor | NumberConstructor | StringConstructor | null | Constructor | [ArrayConstructor, PTy] | AnyTyTy

function loadAs(jv: JsonValue, cls: PTy): any {
    if (cls === AnyTy) {
        if (jv instanceof JsonArray) {
            return loadAs(jv, [Array, AnyTy]);
        } else {
            return jv.unwrap();
        }
    }
    if (cls instanceof Array) {
        if (cls[0] === Array) {
            if (jv instanceof JsonArray) {
                const arr: Array<JsonValue> = jv.unwrap();
                return arr.map(x => loadAs(x, cls[1]));
            }
            throw new Error("expected an array but got a different value");
        }
    }
    if (cls === Boolean) {
        if (jv instanceof JsonBoolean) {
            return jv.unwrap();
        }
        throw new Error("expected a boolean but got a different value");
    }
    if (cls === null) {
        if (jv instanceof JsonNull) {
            return jv.unwrap();
        }
        throw new Error("expected null but got a different value");
    }
    if (cls === Number) {
        if (jv instanceof JsonNumber) {
            return jv.unwrap();
        }
        throw new Error("expected a number but got a different value");
    }
    if (cls === String) {
        if (jv instanceof JsonString) {
            return jv.unwrap();
        }
        throw new Error("expected a string but got a different value");
    }
    throw new Error("NOT IMPLEMENTED");
}

/** Parse the JSON text as a member of the given type. */
export function parseAs(text: string, cls: AnyTyTy): any;
export function parseAs(text: string, cls: BooleanConstructor): Boolean;
export function parseAs(text: string, cls: NumberConstructor): Number;
export function parseAs(text: string, cls: StringConstructor): String;
export function parseAs(text: string, cls: ArrayConstructor): Array<unknown>;
export function parseAs(text: string, cls: [ArrayConstructor, PTy]): Array<unknown>;
export function parseAs(text: string, cls: null): null;
export function parseAs(text: string, cls: PTy) {
    if (cls === Array) {
        return parseAs(text, [Array, AnyTy]);
    }
    return loadAs(parse(text).either(l => { throw l }, r => r), cls);
}
