import { Either, Maybe } from './deps.ts';

import {
    flattenNonEmpty,
    groupingStartAndEnd,
    NestMap,
    NonEmptyFirstCanDiffer,
    NonEmptyNestedFirstCanDiffer,
} from './util.ts';

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

function toJsonValue(x: JsonValueRaw): JsonValue {
    if (typeof x === 'string') {
        return GenJsonValue.jsonString(x);
    } else if (typeof x === 'boolean') {
        return GenJsonValue.jsonBoolean(x);
    } else if (typeof x === 'number') {
        return GenJsonValue.jsonNumber(x);
    } else if (x === null) {
        return GenJsonValue.jsonNull();
    } else if (x instanceof Array) {
        return GenJsonValue.jsonArray(x.map(v => toJsonValue(v)));
    } else {
        const res: { [k: string]: JsonValue } = {};
        for (const k in x) {
            res[k] = toJsonValue(x[k]);
        }
        return GenJsonValue.jsonObject(res);
    }
}

function parseJSON(text: string): Either<SyntaxError, JsonValueRaw> {
    try {
        return Either.right(JSON.parse(text));
    } catch (e) {
        if (e instanceof SyntaxError) {
            return Either.left(e);
        }
        throw e;
    }
}

function parse(text: string): Either<SyntaxError, JsonValue> {
    return parseJSON(text).map(toJsonValue);
}

class ParseContext {
    parentContext: Maybe<ParseContext>;

    private constructor(parent?: ParseContext) {
        if (parent === undefined) {
            this.parentContext = Maybe.none();
        } else {
            this.parentContext = Maybe.some(parent);
        }
    }

    renderFull(): string {
        return (this.parentContext.maybe("", c => c.renderFull()) + "\n" + this.renderThis()).trim();
    }

    protected renderThis(): string {
        return "";
    }

    getParentContext(): Maybe<ParseContext> {
        return this.parentContext;
    }

    /** The active context when just starting a parse. */
    static topLevelContext() {
        return new ParseContext();
    }

    static readingValueForSpec(parent: ParseContext, schemas: Schemas, spec: TySpec, value: JsonValue): ParseContext {
        return new ParseContext.ReadingValueForSpec(parent, schemas, spec, value);
    }

    static keyEntered(parent: ParseContext, key: string): ParseContext {
        return new ParseContext.KeyEntered(parent, key);
    }

    static atIndex(parent: ParseContext, index: number): ParseContext {
        return new ParseContext.AtIndex(parent, index);
    }

    private static ReadingValueForSpec = class extends ParseContext {
        private schemas: Schemas;
        private spec: TySpec;
        private value: JsonValue;

        constructor(parent: ParseContext, schemas: Schemas, spec: TySpec, value: JsonValue) {
            super(parent);
            this.spec = spec;
            this.schemas = schemas;
            this.value = value;
        }

        renderThis(): string {
            return `When trying to read a value for specification: ${this.schemas.getDescription(this.spec)}\nI saw: ${this.value.toJsonString()}`;
        }
    }

    private static AtIndex = class extends ParseContext {
        private index: number;

        constructor(parent: ParseContext, index: number) {
            super(parent);
            this.index = index;
        }

        renderThis(): string {
            return `At index: ${this.index}`;
        }
    }

    private static KeyEntered = class extends ParseContext {
        private key: string;

        constructor(parent: ParseContext, key: string) {
            super(parent);
            this.key = key;
        }

        renderThis(): string {
            return "In key: " + JSON.stringify(this.key);
        }
    }
}

export class JsonParseError extends Error {
    protected context: ParseContext;

    constructor(context: ParseContext, message: string) {
        super(`${context.renderFull()}\n${message}`);
        this.context = context;
    }
}

export type JsonParseResult<T> = Either<JsonParseError, T>;

function determinerFor(s: string): string {
    return s.match('^[aoeiu]') ? 'an' : 'a';
}

export class JsonParser {

    private schemas: Schemas;
    private context: Maybe<ParseContext>;

    constructor(schemas?: Schemas, noDefault?: boolean) {
        schemas = Schemas.mergeSchemas(noDefault ? Schemas.emptySchemas() : defaultSchema(), schemas !== undefined ? schemas : Schemas.emptySchemas());
        this.schemas = schemas;
        this.context = Maybe.none();
    }

    private updateContext(f: (c: ParseContext) => ParseContext) {
        this.context = Maybe.some(f(this.checkParsingOrFail()));
    }

    private tryingToLoadValueForSpec(spec: TySpec, value: JsonValue) {
        this.updateContext(c => ParseContext.readingValueForSpec(c, this.schemas, spec, value));
    }

    private contextEnterKey(k: string) {
        this.updateContext(c => ParseContext.keyEntered(c, k));
    }

    private contextAtIndex(i: number) {
        this.updateContext(c => ParseContext.atIndex(c, i));
    }

    _getDescriptionForSpec(spec: TySpec): string {
        return this.schemas.getDescription(spec);
    }

    private contextPop() {
        this.context = Maybe.join(this.context.map(c => c.getParentContext()));
    }

    /**
     * Parse the JSON text as a member of the given type. Intended to
     * be used when parsing a value that belongs to an object key.
     */
    loadKeyAs(k: string, jv: JsonValue, spec: TySpec): JsonParseResult<any> {
        this.contextEnterKey(k);
        const res = this.loadAs(jv, spec);
        this.contextPop();
        return res;
    }

    /**
     * Parse the JSON text as a member of the given type. Intended to
     * be used when parsing a value at the given index of an array.
     */
    loadIndexAs(i: number, jv: JsonValue, spec: TySpec): JsonParseResult<any> {
        this.contextAtIndex(i);
        const res = this.loadAs(jv, spec);
        this.contextPop();
        return res;
    }

    /** Parse the JSON text as a member of the given type. */
    loadAs(jv: JsonValue, cls: TySpec): JsonParseResult<any> {
        this.tryingToLoadValueForSpec(cls, jv);
        const maybeSchema = this.schemas.getSchemaForSpec(cls);
        if (maybeSchema.isSome()) {
            const schema = maybeSchema.unwrap();
            const res = schema.on(this, jv);
            this.contextPop();
            return res;
        }
        return this.failWithUnknownSpec(cls);
    }

    checkParsingOrFail(): ParseContext | never {
        return this.context.maybef(() => { throw new Error("FATAL: tried to retrieve context when not parsing.") }, r => r);
    }

    failWithMissingKeys<T>(missingKeys: string[]): JsonParseResult<T> {
        const context = this.checkParsingOrFail();
        return JsonParser.failParse(new JsonParser.MissingKeysError(context, missingKeys));
    }

    failWithTypeError<T>(tyDesc: string): JsonParseResult<T> {
        const context = this.checkParsingOrFail();
        return JsonParser.failParse(new JsonParser.JsonTypeError(context, tyDesc));
    }

    failWithUnknownKeys<T>(unknownKeys: string[]): JsonParseResult<T> {
        const context = this.checkParsingOrFail();
        return JsonParser.failParse(new JsonParser.UnknownKeysError(context, unknownKeys));
    }

    failWithUnknownSpec<T>(spec: TySpec): JsonParseResult<T> {
        const context = this.checkParsingOrFail();
        return JsonParser.failParse(new JsonParser.UnknownSpecError(context, spec));
    }

    private initialiseForParsing() {
        this.context = Maybe.some(ParseContext.topLevelContext());
    }

    private cleanupAfterParsing() {
        this.context = Maybe.none();
    }

    private withSetupCleanUp<T>(f: () => T): T {
        this.initialiseForParsing();
        let res;
        try {
            res = f();
        } catch (e) {
            throw e;
        } finally {
            this.cleanupAfterParsing();
        }
        return res;
    }

    /**
     * Parse the JSON text as a member of the given type.
     *
     * Similar to {@link parseAs}, but throw any resulting exception immediately.
     */
    parseAsOrThrow(text: string, cls: TySpec): any {
        return this.withSetupCleanUp(() => {
            return parse(text).mapCollecting(v => this.loadAs(v, cls)).orThrow();
        });
    }

    /** Parse the JSON text as a member of the given type. */
    parseAs(text: string, cls: TySpec): Either<SyntaxError | JsonParseError, any> {
        return this.withSetupCleanUp(() => {
            return parse(text).mapCollecting(v => this.loadAs(v, cls));
        });
    }

    static failParse<T>(err: JsonParseError): JsonParseResult<T> {
        return Either.fail(err);
    }

    static parseOk<T>(x: T): JsonParseResult<T> {
        return Either.pure(x);
    }
}

export namespace JsonParser {
    export class JsonTypeError extends JsonParseError {
        constructor(context: ParseContext, actualTyDesc: string) {
            super(context, `But this is ${determinerFor(actualTyDesc)} ${actualTyDesc}`);
        }
    }

    export class MissingKeysError extends JsonParseError {
        constructor(context: ParseContext, keys: string[]) {
            super(context, `But the following keys are required and were not specified: ${keys.map(k => JSON.stringify(k)).join(', ')}`);
        }
    }

    export class UnknownKeysError extends JsonParseError {
        constructor(context: ParseContext, keys: string[]) {
            super(context, `But I saw the following keys which are not accepted by the specification: ${keys.map(k => JSON.stringify(k)).join(', ')}`);
        }
    }

    export class UnknownSpecError extends JsonParseError {
        constructor(context: ParseContext, spec: TySpec) {
            super(context, `But I don't know how to parse a value for the specification: ${tySpecDescription(spec)}`);
        }
    }
}

type StringKeyed<T> = { [k: string]: T };

type JsonValueLoader<K extends keyof JsonType, T> = TySpec | ((parser: JsonParser, json: GenJsonValue<K>) => JsonParseResult<T>);

type JParser<T> = {
    onArray: JsonValueLoader<'array', T>,
    onBoolean: JsonValueLoader<'boolean', T>,
    onNull: JsonValueLoader<'null', T>,
    onNumber: JsonValueLoader<'number', T>,
    onObject: JsonValueLoader<'object', T>,
    onString: JsonValueLoader<'string', T>
};

function allSchemasSame<T>(f: JsonValueLoader<keyof JsonType, T>): JParser<T> {
    return {
        onArray: f,
        onBoolean: f,
        onNull: f,
        onNumber: f,
        onObject: f,
        onString: f,
    };
}

function isConstructor(c: any): c is Constructor {
    try {
        Reflect.construct(Object, [], c);
        return true;
    } catch (_) {
        return false;
    }
}

/**
 * Schema that specifies how to load from JSON.
 *
 * The constructor takes a single argument which specifies how to
 * parse each JSON value. The argument can specify the following keys:
 * 'onArray', 'onBoolean', 'onNull', 'onNumber', 'onObject', and
 * 'onString'. The value at each key may either be a specifier (e.g.,
 * "Boolean" or "[Array, Number]"), in which case the specifier is
 * used to load the value; or it may be a function which takes the
 * active parser, and the JSON value of the respective type, and
 * produces a {@link JsonParseResult}.
 *
 */
export class JsonSchema<T> {
    private objectParser: JParser<T>;

    constructor(objectParser: Partial<JParser<T>>) {
        this.objectParser = {
            ...allSchemasSame((parser, value) => parser.failWithTypeError(value.getType())),
            ...objectParser
        };
    }

    static genArraySchema<T>(eltSpec: TySpec, onRes: (x: any[]) => T): JParser<T>['onArray'] {
        return (parser: JsonParser, json: JsonArray): JsonParseResult<T> => {
            const res = new Array<any>();
            const arr = json.unwrap();
            for (let i = 0; i < arr.length; i++) {
                const v = parser.loadIndexAs(i, arr[i], eltSpec);
                if (v.isLeft()) {
                    return v.propLeft();
                }
                res[i] = v.unwrapRight();
            }
            return JsonParser.parseOk(onRes(res));
        }
    }

    static arraySchema<T>(eltSpec: TySpec, onRes: (x: any[]) => T): JsonSchema<T> {
        return new JsonSchema({
            onArray: JsonSchema.genArraySchema(eltSpec, onRes),
        });
    }

    static genBooleanSchema<T>(onRes: (x: boolean) => T): JParser<T>['onBoolean'] {
        return (_parser: JsonParser, json: JsonBoolean): JsonParseResult<T> => {
            return JsonParser.parseOk(onRes(json.unwrap()));
        }
    }

    static booleanSchema<T>(onRes: (x: boolean) => T): JsonSchema<T> {
        return new JsonSchema({
            onBoolean: JsonSchema.genBooleanSchema(onRes)
        });
    }

    static genNullSchema<T>(onRes: (x: null) => T): JParser<T>['onNull'] {
        return (_parser: JsonParser, json: JsonNull): JsonParseResult<T> => {
            return JsonParser.parseOk(onRes(json.unwrap()));
        }
    }

    static nullSchema<T>(onRes: (x: null) => T): JsonSchema<T> {
        return new JsonSchema({
            onNull: JsonSchema.genNullSchema(onRes)
        });
    }

    static genNumberSchema<T>(onRes: (x: number) => T): JParser<T>['onNumber'] {
        return (_parser: JsonParser, json: JsonNumber): JsonParseResult<T> => {
            return JsonParser.parseOk(onRes(json.unwrap()));
        }
    }

    static numberSchema<T>(onRes: (x: number) => T): JsonSchema<T> {
        return new JsonSchema({
            onNumber: JsonSchema.genNumberSchema(onRes)
        });
    }

    static genObjectMapSchema<T>(kfun: (k: string) => TySpec, onRes: (x: Map<string, any>) => T): JParser<T>['onObject'] {
        return (parser: JsonParser, json: JsonObject): JsonParseResult<T> => {
            const res = new Map<string, any>();
            const obj = json.unwrap();
            for (const k in obj) {
                const v = parser.loadKeyAs(k, obj[k], kfun(k));
                if (v.isLeft()) {
                    return v.propLeft();
                }
                res.set(k, v.unwrapRight());
            }
            return JsonParser.parseOk(onRes(res));
        }
    }

    static objectSchemaMap<T>(kfun: (k: string) => TySpec, onRes: (x: Map<string, any>) => T): JsonSchema<T> {
        return new JsonSchema({
            onObject: JsonSchema.genObjectMapSchema(kfun, onRes),
        });
    }

    static objectSchema<T>(ks: StringKeyed<TySpec>, onRes: (x: StringKeyed<any>) => T): JsonSchema<T> {
        return new JsonSchema({
            onObject(parser: JsonParser, json: JsonObject): JsonParseResult<T> {
                const unreadKeys = new Set<string>();
                const missedKeys = new Set<string>();
                for (const ksk in ks) {
                    missedKeys.add(ksk);
                }
                const res: { [k: string]: any } = {};
                const obj = json.unwrap();
                for (const k in obj) {
                    unreadKeys.add(k);
                    for (const ksk in ks) {
                        if (ksk == k) {
                            unreadKeys.delete(k);
                            missedKeys.delete(ksk);
                            const v = parser.loadKeyAs(k, obj[k], ks[ksk]);
                            if (v.isLeft()) {
                                return v.propLeft();
                            }
                            res[k] = v.unwrapRight();
                        }
                    }
                }
                if (unreadKeys.size > 0) {
                    return parser.failWithUnknownKeys(Array.from(unreadKeys.values()));
                }
                if (missedKeys.size > 0) {
                    return parser.failWithMissingKeys(Array.from(missedKeys.values()));
                }
                return JsonParser.parseOk(onRes(res));
            }
        });
    }

    static genStringSchema<T>(onRes: (x: string) => T): JParser<T>['onString'] {
        return (_parser: JsonParser, json: JsonString): JsonParseResult<T> => {
            return JsonParser.parseOk(onRes(json.unwrap()));
        }
    }

    static stringSchema<T>(onRes: (x: string) => T): JsonSchema<T> {
        return new JsonSchema({
            onString: JsonSchema.genStringSchema(onRes)
        });
    }

    static customSchema<T>(specs: Partial<JParser<T>>): JsonSchema<T> {
        return new JsonSchema(specs);
    }

    /**
     * If the provided argument is a specification, then try and load
     * the value using it. Otherwise, the argument is a function that
     * can process the value, so run it with the given value.
     */
    private static orSpec<K extends keyof JsonType, T>(s: TySpec | ((parser: JsonParser, val: GenJsonValue<K>) => JsonParseResult<T>), parser: JsonParser, o: GenJsonValue<K>): JsonParseResult<T> {
        return (typeof s === 'function' && !isConstructor(s)) ? s(parser, o) : parser.loadAs(o, s);
    }

    on(parser: JsonParser, o: JsonValue): JsonParseResult<T> {
        if (o.isArray()) {
            return JsonSchema.orSpec(this.objectParser.onArray, parser, o);
        } else if (o.isBoolean()) {
            return JsonSchema.orSpec(this.objectParser.onBoolean, parser, o);
        } else if (o.isNull()) {
            return JsonSchema.orSpec(this.objectParser.onNull, parser, o);
        } else if (o.isNumber()) {
            return JsonSchema.orSpec(this.objectParser.onNumber, parser, o);
        } else if (o.isObject()) {
            return JsonSchema.orSpec(this.objectParser.onObject, parser, o);
        } else if (o.isString()) {
            return JsonSchema.orSpec(this.objectParser.onString, parser, o);
        }
        throw new Error("fatal: unknown class representing a JSON value: " + String(o.constructor));
    }
}

interface Constructor {
    new(...args: any[]): any;
}

/** Represents values that can take any type. */
export const AnyTy = Symbol("AnyTy");

type SchemaBuilder = SFun<JsonSchema<any>>;

type DescriptionFn = SFun<string>;

function tySpecAsGroupedBase(x: TySpec): NonEmptyNestedFirstCanDiffer<TySpecBase, TySpecArgBase> {
    if (x instanceof Array) {
        return x;
    }
    return [x];
}

function flattenTySpec(x: TySpec): NonEmptyFirstCanDiffer<TySpecBase, TySpecArgBase> {
    return flattenNonEmpty(tySpecAsGroupedBase(x));
}

function hasRestParameter(f: (...args: any[]) => any): boolean {
    return f.toString().match(/^(?:function [^(]*)?(\([^)]*\.\.\.[^.) ]+\))/) ? true : false;
}

function argChecker(spec: TySpec, f: (...args: any[]) => any, maxArgs: undefined | number) {
    const maxNumOfArgs = maxArgs !== undefined ? maxArgs : hasRestParameter(f) ? Infinity : f.length;
    const minArgs = f.length;
    return (args: any[]) => {
        if (args.length > maxNumOfArgs || args.length < minArgs) {
            throw new Schemas.WrongNumberOfArgumentsError(spec, args.length, minArgs, maxNumOfArgs);
        }
    };
}

class Spec<K extends 'specs' | 'mixed', T> {
    private accepts: K;
    private description: Maybe<DescriptionFn[K]>;
    private builder: Maybe<SFun<JsonSchema<T>>[K]>;

    constructor(opts: {
        accepts: K
        description?: DescriptionFn[K],
        build?: SFun<JsonSchema<T>>[K]
    }) {
        this.accepts = opts.accepts;
        this.description = opts.description === undefined ? Maybe.none() : Maybe.some(opts.description);
        this.builder = opts.build === undefined ? Maybe.none() : Maybe.some(opts.build);
    }

    getBuilder(): Maybe<[K, SFun<JsonSchema<T>>[K]]> {
        return this.builder.map(b => [this.accepts, b]);
    }

    getDescriptionFn(): Maybe<[K, DescriptionFn[K]]> {
        return this.description.map(d => [this.accepts, d]);
    }
}

export class Schemas {
    private specs: NestMap<TySpecArgBase, Spec<keyof SFun<any>, any>>;

    constructor() {
        this.specs = new NestMap();
    }

    private _addSpec<K extends 'specs' | 'mixed', T>(spec: TySpec, opts: {
        accepts: K
        description?: string | ((f: (t: TySpecArg) => string) => DescriptionFn[K]),
        maxArgs?: number
        load?: JsonSchema<T> | SchemaBuilder[K]
    }): Schemas {
        const accepts = opts.accepts;
        const description = opts.description;
        const s = flattenTySpec(spec);

        let descFn: undefined | DescriptionFn[K] = undefined;
        if (typeof description === 'string') {
            descFn = (..._: TySpecArg[]) => description;
        } else if (description !== undefined) {
            const innerDesc = description(t => this.getDescription(t));
            const checkArgs = argChecker(s, innerDesc, opts.maxArgs);
            descFn = (...args: TySpecArg[]) => {
                checkArgs(args);
                return (innerDesc instanceof Array ? innerDesc[1] : innerDesc)(...args);
            };
        }

        let builder: undefined | SchemaBuilder[K] = undefined;
        const load = opts.load;
        if (load instanceof JsonSchema) {
            builder = () => load;
        } else if (load !== undefined) {
            const checkArgs = argChecker(s, load, opts.maxArgs);
            builder = (...args: TySpecArg[]) => {
                checkArgs(args);
                return (load instanceof Array ? load[1] : load)(...args);
            };
        }

        this.specs.set(s, new Spec({
            accepts: accepts,
            description: descFn,
            build: builder
        }));
        return this;
    }

    /**
     * Add a specifier.
     *
     * 'description' may either be a string, or a function that takes
     * a rendering function and a list of specifications, and produces
     * a string.
     *
     * 'load' describes how to load a value.
     *
     * 'maxArgs' should be the maximum number of argument specifiers
     * supported, and 'description' and 'load' should support being
     * passed this many arguments. If maxArgs is not provided, then
     * the number of mandatory arguments is used, or Infinity if a
     * rest argument exists.
     */
    addSpec<T>(spec: TySpec, opts: {
        description?: string | ((f: (t: TySpecArg) => string) => DescriptionFn['specs']),
        maxArgs?: number
        load?: JsonSchema<T> | SchemaBuilder['specs']
    }): Schemas {
        return this._addSpec(spec, { accepts: 'specs', ...opts });
    }

    /**
     * Like {@link addSpec}, but arguments may be non-specifications.
     */
    addMixedSpec<T>(spec: TySpec, opts: {
        description?: string | ((f: (t: TySpecArg) => string) => DescriptionFn['mixed']),
        maxArgs?: number
        load?: JsonSchema<T> | SchemaBuilder['mixed']
    }): Schemas {
        return this._addSpec(spec, { accepts: 'mixed', ...opts });
    }

    private mostSpecificSchema(spec: TySpec): Maybe<[TySpec, [keyof SchemaBuilder, SchemaBuilder[keyof SchemaBuilder]], TySpec[]]> {
        return Maybe.join(this.mostSpecificSpec(spec).map(c => c[1].getBuilder().map(b => [c[0], b, c[2]])));
    }

    /** Get the schema associated with the given specification, if any. */
    getSchemaForSpec(spec: TySpec): Maybe<JsonSchema<any>> {
        return this.mostSpecificSchema(spec)
            .map(([_, [ty, f], args]: [TySpec, [keyof SchemaBuilder, SchemaBuilder[keyof SchemaBuilder]], TySpecArg[]]) => {
                if (ty === 'specs') {
                    const tyArgs = args.map(t => {
                        if (argIsSpec(t)) {
                            return t
                        }
                        throw new Error('passed non-spec argument')
                    })
                    return (f as SchemaBuilder['specs'])(...tyArgs);
                }
                return (f as SchemaBuilder['mixed'])(...args);
            });
    }

    private mostSpecificSpec(spec: TySpec): Maybe<[TySpec, Spec<keyof SFun<any>, any>, TySpec[]]> {
        return this.specs.getBestAndRestWithPath(flattenTySpec(spec)).map(x => {
            const [path, foundSpec, rest] = x;
            const [specMatch, args] = groupingStartAndEnd(tySpecAsGroupedBase(spec), path, rest);
            return [(specMatch.length > 1 ? specMatch : specMatch[0]) as TySpec, foundSpec, args as TySpec[]];
        });
    }

    private mostSpecificDescription(spec: TySpec): Maybe<[TySpec, [keyof DescriptionFn, DescriptionFn[keyof DescriptionFn]], TySpec[]]> {
        return Maybe.join(this.mostSpecificSpec(spec).map(c => c[1].getDescriptionFn().map(d => [c[0], d, c[2]])));
    }

    static _getDescriptionBase(spec: TySpecArg): string {
        if (spec instanceof Array) {
            if (spec.length == 1) {
                return Schemas._getDescriptionBase(spec[0]);
            }
            return `[${spec.map(t => Schemas._getDescriptionBase(t)).join(', ')}]`;
        } else {
            return tySpecBaseDescription(spec);
        }
    }

    getDescription(spec: TySpecArg): string {
        if (!argIsSpec(spec)) {
            return JSON.stringify(spec);
        }
        return this.mostSpecificDescription(spec).maybef(() => {
            if (spec instanceof Array) {
                return `[${spec.map(t => this.getDescription(t)).join(', ')}]`;
            } else {
                return tySpecBaseDescription(spec);
            }
        }, ([_, [ty, f], args]: [TySpec, [keyof DescriptionFn, DescriptionFn[keyof DescriptionFn]], TySpecArg[]]) => {
            if (ty === 'specs') {
                const tyArgs = args.map(t => {
                    if (argIsSpec(t)) {
                        return t
                    }
                    throw new Error('passed non-spec argument')
                })
                return (f as DescriptionFn['specs'])(...tyArgs);
            }
            return (f as DescriptionFn['mixed'])(...args);
        })
    }

    protected getSpecMap(): NestMap<TySpecArgBase, Spec<keyof SFun<any>, any>> {
        return this.specs;
    }

    /** Merge with another schema, favouring definitions in the parameter schema. */
    protected mergeWith(schemas: Schemas) {
        this.specs = new NestMap<TySpecArgBase, Spec<keyof SFun<any>, any>>().mergeWith(this.getSpecMap()).mergeWith(schemas.getSpecMap());
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

    static WrongNumberOfArgumentsError = class extends TypeError {
        constructor(spec: TySpec, numActual: number, minExpected?: number, maxExpected?: number) {
            const minStr = minExpected ? "at least " + minExpected : "";
            const maxStr = maxExpected !== undefined && maxExpected !== Infinity ? "at most " + maxExpected : "";
            const expStr = minExpected == maxExpected && minExpected !== undefined
                ? "exactly " + minExpected : minStr && maxStr ? minStr + " and " + maxStr : minStr + maxStr;
            super(`The specification ${Schemas._getDescriptionBase(spec)} was given ${numActual} argument${numActual === 1 ? '' : 's'}, but expected ${expStr}`);
        }
    }
}

function mapToObject<T>(m: Map<string, T>): { [k: string]: T } {
    const res: { [k: string]: T } = {};
    for (const [k, v] of m) {
        res[k] = v;
    }
    return res;
}

/** Matches if any of the specifications match. Matches with the first matching specification. */
export const anyOf = Symbol("anyOf");

/** [tuple, t1, ..., tn] matches an array of length n whose ith element matches ti. */
export const tuple = Symbol("tuple");

export const Enum = Symbol("Enum");

function defaultSchema(): Schemas {
    return Schemas.emptySchemas()
        .addSpec(anyOf, {
            load: (...tys) => JsonSchema.customSchema(allSchemasSame(
                (parser, json) => {
                    for (const ty of tys) {
                        const res = parser.loadAs(json, ty);
                        if (res.isRight()) {
                            return res;
                        }
                    }
                    return parser.failWithTypeError(json.getType());
                }))
        })
        .addSpec(AnyTy, {
            description: 'anything',
            load: () => JsonSchema.customSchema(allSchemasSame((_parser, json) => JsonParser.parseOk(json.unwrapFully())))
        })
        .addSpec(Array, {
            maxArgs: 1,
            description: getDesc => (t = AnyTy) => 'Array of ' + getDesc(t),
            load: (t: TySpec = AnyTy) => JsonSchema.arraySchema(t, r => r)
        })
        .addSpec(Boolean, {
            description: 'boolean',
            load: JsonSchema.booleanSchema(x => x)
        })
        .addMixedSpec(Enum, {
            description: (getDesc) => (...args) => `One of the following (Enum): ${args.map(getDesc).join(" OR ")}`,
            load: (...args) => JsonSchema.customSchema(allSchemasSame((parser, value) => {
                const v = value.unwrapFully();
                return args.includes(v as any) ? JsonParser.parseOk(v) : parser.failWithTypeError('different value');
            }))
        })
        .addSpec(Map, {
            maxArgs: 1,
            description: getDesc => (t = AnyTy) => "Map with string keys and values matching " + getDesc(t),
            load: (t = AnyTy) => JsonSchema.objectSchemaMap(_ => t, r => r)
        })
        .addSpec(null, {
            description: 'null',
            load: JsonSchema.nullSchema(x => x)
        })
        .addSpec(Number, {
            description: 'number',
            load: JsonSchema.numberSchema(x => x)
        })
        .addSpec(Object, {
            maxArgs: 1,
            description: getDesc => (t = AnyTy) => 'Object whose values are ' + getDesc(t),
            load: (t = AnyTy) => JsonSchema.objectSchemaMap(_ => t, r => mapToObject(r))
        })
        .addSpec(Set, {
            maxArgs: 1,
            load: (t = AnyTy) => JsonSchema.arraySchema(t, r => new Set(r)),
        })
        .addSpec(String, {
            description: 'string',
            load: JsonSchema.stringSchema(x => x)
        })
        .addSpec(tuple, {
            load: (...tys) => JsonSchema.customSchema({
                onArray: (parser, val) => {
                    const arr = val.unwrap();
                    if (arr.length !== tys.length) {
                        return parser.failWithTypeError(`array of length ${arr.length}`);
                    }
                    const res = [];
                    for (let i = 0; i < arr.length; i++) {
                        const loaded = parser.loadAs(arr[i], tys[i]);
                        if (loaded.isLeft()) {
                            return loaded;
                        } else {
                            res[i] = loaded.unwrapRight();
                        }
                    }
                    return Either.right(res);
                }
            })
        })
}

/** Type-like specification for how to read from JSON. Includes constructors and additional types like 'null' and {@link AnyTy} */
type TySpecBase = symbol | null | Constructor
type TySpecArgRaw = boolean | number | string;
type TySpecArgBase = TySpecArgRaw | TySpecBase
type TySpecArg = TySpecArgRaw | TySpec
export type TySpec = TySpecBase | [TySpecBase, ...TySpecArg[]]

function tySpecBaseDescription(t: TySpecArgBase): string {
    if (typeof t === 'symbol') {
        return t.toString();
    }
    if (!argIsSpec(t)) {
        return JSON.stringify(t);
    }
    if (t === null) {
        return 'null'
    }
    return t.name;
}

function tySpecArgDescription(t: TySpecArg): string {
    if (t instanceof Array) {
        return tySpecDescription(t);
    }
    return tySpecBaseDescription(t);
}

function tySpecDescription(t: TySpec): string {
    if (t instanceof Array) {
        const [head, ...rest] = t;
        return `[${[tySpecBaseDescription(head), ...rest.map(tySpecArgDescription)].join(', ')}]`;
    } else {
        return tySpecBaseDescription(t);
    }
}

function argIsSpec(x: TySpecArg): x is TySpec {
    return !(typeof x).match('^(string|number)$');
}

type SFun<T> = { 'specs': (...args: TySpec[]) => T, 'mixed': (...args: TySpecArg[]) => T }
