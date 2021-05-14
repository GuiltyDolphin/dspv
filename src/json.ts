import { Either, Maybe } from './deps.ts';

import { NestMap } from './util.ts';

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

    toJsonString(): string {
        return JSON.stringify(this.unwrapFully());
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
    if (typeof x === 'string') {
        return pure(GenJsonValue.jsonString(x));
    } else if (typeof x === 'boolean') {
        return pure(GenJsonValue.jsonBoolean(x));
    } else if (typeof x === 'number') {
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
    } else if (typeof x === 'function') {
        return fail('functions not supported by JSON');
    } else if (typeof x === 'object') {
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
        schemas = Schemas.mergeSchemas(noDefault ? Schemas.emptySchemas() : defaultSchema(), schemas !== undefined ? schemas : Schemas.emptySchemas());
        this.schemas = schemas;
    }

    /** Parse the JSON text as a member of the given type. */
    loadAs(jv: JsonValue, cls: TySpec): JsonParseResult<any> {
        const maybeSchema = this.schemas.getSchemaForSpec(cls);
        if (maybeSchema.isSome()) {
            const schema = maybeSchema.unwrap();
            return schema.on(this, jv);
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
        return JsonParser.failParse(new JsonParser.UnknownSpecError(cls));
    }

    /**
     * Parse the JSON text as a member of the given type.
     *
     * Similar to {@link parseAs}, but throw any resulting exception immediately.
     */
    parseAsOrThrow(text: string, cls: TySpec): any {
        return parse(text).mapCollecting(v => this.loadAs(v, cls)).either(err => { throw err }, r => r);
    }

    /** Parse the JSON text as a member of the given type. */
    parseAs(text: string, cls: TySpec): any {
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
        private value: JsonValue | JsonValueRaw;

        constructor(expected: string, actualTy: string, value: JsonValue | JsonValueRaw) {

            const vstr = value instanceof GenJsonValue ? value.toJsonString() : JSON.stringify(value);
            super(`expected: ${expected}\nbut got: ${actualTy}: ${vstr}`);

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

    static UnknownSpecError = class extends JsonParseError {
        private spec: TySpec;

        constructor(spec: TySpec) {
            super(`I don't know how to parse a value for the specification: ${tySpecDescription(spec)}`);
            this.spec = spec;
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
                return JsonParser.failParse(new JsonParser.JsonTypeError(this.getDescription(), tyDesc, o));
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

    static arraySchema<T>(desc: string, eltSpec: TySpec, onRes: (x: any[]) => T): JsonSchema<T> {
        return new JsonSchema(desc, {
            onArray(parser: JsonParser, json: JsonArray): JsonParseResult<T> {
                const res = new Array<any>();
                const arr = json.unwrap();
                for (let i = 0; i < arr.length; i++) {
                    const v = parser.loadAs(arr[i], eltSpec);
                    if (v.isLeft()) {
                        return v.propLeft();
                    }
                    res[i] = v.unwrapRight();
                }
                return JsonParser.parseOk(onRes(res));
            }
        });
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

    static objectSchemaMap<T>(desc: string, kfun: (k: string) => TySpec, onRes: (x: Map<string, any>) => T): JsonSchema<T> {
        return new JsonSchema(desc, {
            onObject(parser: JsonParser, json: JsonObject): JsonParseResult<T> {
                const res = new Map<string, any>();
                const obj = json.unwrap();
                for (const k in obj) {
                    const v = parser.loadAs(obj[k], kfun(k));
                    if (v.isLeft()) {
                        return v.propLeft();
                    }
                    res.set(k, v.unwrapRight());
                }
                return JsonParser.parseOk(onRes(res));
            }
        });
    }

    static objectSchema<T>(desc: string, ks: StringKeyed<TySpec>, onRes: (x: StringKeyed<any>) => T): JsonSchema<T> {
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

/** Represents values that can take any type. */
export const AnyTy = Symbol("AnyTy");

type NonEmptyList<T> = [T, ...T[]];

type SchemaBuilder = (...args: TySpec[]) => JsonSchema<any>;

type TySpecMap = NestMap<TySpecBase, SchemaBuilder>;

function flattenTySpec(x: TySpec): NonEmptyList<TySpecBase> {
    if (x instanceof Array) {
        let [head, ...tail] = x;
        const rs = tail.map(flattenTySpec).flat();
        return [head, ...rs];
    }
    return [x];
}

export class Schemas {
    private schemas: TySpecMap;
    private aliases: NestMap<TySpecBase, TySpec>;

    constructor() {
        this.schemas = new NestMap();
        this.aliases = new NestMap();
    }

    addAlias(spec: TySpec, alias: TySpec): Schemas {
        this.aliases.set(flattenTySpec(spec), alias);
        return this;
    }

    addSchema<T>(spec: TySpec, schema: JsonSchema<T> | ((...args: TySpec[]) => JsonSchema<T>)): Schemas {
        const s = flattenTySpec(spec);
        if (schema instanceof JsonSchema) {
            this.schemas.set(s, () => schema);
        } else {
            this.schemas.set(s, schema);
        }
        return this;
    }

    protected resolveAlias(spec: TySpec): TySpec {
        const alias = this.aliases.get(flattenTySpec(spec));
        return alias.maybe(spec, alias => this.resolveAlias(alias));
    }

    private mostSpecificSchema(spec: TySpec): Maybe<[SchemaBuilder, TySpec[]]> {
        return this.schemas.getBestAndRest(flattenTySpec(spec));
    }

    getSchemaForSpec(spec: TySpec): Maybe<JsonSchema<any>> {
        return this.mostSpecificSchema(this.resolveAlias(spec))
            .map(([f, args]: [SchemaBuilder, TySpec[]]) => f(...args));
    }

    protected getSchemaMap(): TySpecMap {
        return this.schemas;
    }

    protected getAliasMap(): NestMap<TySpecBase, TySpec> {
        return this.aliases;
    }

    /** Merge with another schema, favouring definitions in the parameter schema. */
    protected mergeWith(schemas: Schemas) {
        this.schemas = new NestMap<TySpecBase, SchemaBuilder>().mergeWith(this.schemas).mergeWith(schemas.getSchemaMap());
        this.aliases = new NestMap<TySpecBase, TySpec>().mergeWith(this.aliases).mergeWith(schemas.getAliasMap());
    }

    static emptySchemas(): Schemas {
        return new Schemas();
    }

    /** Merge schemas into a new schema, favouring definitions in latter schemas if there is overlap. */
    static mergeSchemas(...schemas: Schemas[]): Schemas {
        const newSchemas = new Schemas();
        schemas.map(e => newSchemas.mergeWith(e));
        return newSchemas;
    }
}

function mapToObject<T>(m: Map<string, T>): { [k: string]: T } {
    const res: { [k: string]: T } = {};
    for (const [k, v] of m) {
        res[k] = v;
    }
    return res;
}

function defaultSchema(): Schemas {
    return Schemas.emptySchemas()
        .addSchema(Array, (t) => JsonSchema.arraySchema('Array of ' + tySpecDescription(t), t, r => r))
        .addAlias(Array, [Array, AnyTy])
        .addSchema(Boolean, JsonSchema.booleanSchema('boolean', x => x))
        .addSchema([Map, String], t => JsonSchema.objectSchemaMap("Map with string keys", _ => t, r => r))
        .addAlias(Map, [Map, String])
        .addAlias([Map, String], [Map, String, AnyTy])
        .addSchema(null, JsonSchema.nullSchema('null', x => x))
        .addSchema(Number, JsonSchema.numberSchema('number', x => x))
        .addSchema(Object, t => JsonSchema.objectSchemaMap('Object whose values are ' + tySpecDescription(t), _ => t, r => mapToObject(r)))
        .addAlias(Object, [Object, AnyTy])
        .addSchema(String, JsonSchema.stringSchema('string', x => x));
}

/** Type-like specification for how to read from JSON. Includes constructors and additional types like 'null' and {@link AnyTy} */
type TySpecBase = symbol | null | Constructor
export type TySpec = TySpecBase | [TySpecBase, TySpec, ...TySpec[]];

function tySpecBaseDescription(t: TySpecBase): string {
    if (typeof t === 'symbol') {
        return t.toString();
    }
    if (t === null) {
        return 'null'
    }
    return t.name;
}

function tySpecDescription(t: TySpec): string {
    if (t instanceof Array) {
        let [head, ...rest] = t;
        return `[${[tySpecBaseDescription(head), ...rest.map(tySpecDescription)].join(', ')}]`;
    } else {
        return tySpecBaseDescription(t);
    }
}
