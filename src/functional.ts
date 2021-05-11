interface Functor<T> {
    map<T2>(f: (t: T) => T2): Functor<T2>;
}

export class Maybe<T> implements Functor<T> {
    private readonly value: [] | [T];

    private constructor(...args: T[]) {
        this.value = args.length == 1 ? [args[0]] : [];
        if (args.length > 1) {
            throw new TypeError('too many arguments to Maybe constructor');
        }
    }

    isSome(): boolean {
        return this.value.length == 1;
    }

    isNone(): boolean {
        return this.value.length == 0;
    }

    /**
     * Only use this if you know you have some.
     */
    unwrap(): T | never {
        if (this.value.length == 1) {
            return this.value[0];
        } else {
            throw new TypeError('tried to unwrap a nothing value');
        }
    }

    maybef<R>(ifNone: () => R, ifSome: (t1: T) => R): R {
        if (this.isSome()) {
            return ifSome(this.unwrap());
        }
        return ifNone();
    }

    maybe<R>(ifNone: R, ifSome: (t1: T) => R): R {
        return this.maybef(() => ifNone, ifSome);
    }

    map<R>(f: (x: T) => R): Maybe<R> {
        return this.maybe(Maybe.none(), x => Maybe.some(f(x)));
    }

    static none<T>(): Maybe<T> {
        return new Maybe();
    }

    static some<T>(x: T): Maybe<T> {
        return new Maybe(x);
    }

    static pure<T>(x: T): Maybe<T> {
        return Maybe.some(x);
    }

    static fail<T>(): Maybe<T> {
        return Maybe.none();
    }
}

export class Either<L, R> implements Functor<R> {
    private readonly leftValue: Maybe<L>;
    private readonly rightValue: Maybe<R>;

    private constructor(left: Maybe<L>, right: Maybe<R>) {
        if (left.isSome() && right.isNone() || left.isNone() && right.isSome()) {
            this.leftValue = left;
            this.rightValue = right;
        } else {
            throw new TypeError('exactly one of left and right must be some');
        }
    }

    isLeft(): boolean {
        return this.leftValue.isSome();
    }

    isRight(): boolean {
        return this.rightValue.isSome();
    }

    mapBoth<L2, R2>(onLeft: (l: L) => L2, onRight: (r: R) => R2): Either<L2, R2> {
        return this.either(l => Either.left(onLeft(l)), r => Either.right(onRight(r)));
    }

    map<R2>(f: (x: R) => R2): Either<L, R2> {
        return this.mapBoth(x => x, r => f(r));
    }

    static joinLeft<L1, L2, R>(v: Either<L1, Either<L2, R>>): Either<L1 | L2, R> {
        return v.either(l => Either.left<L1 | L2, R>(l), r => r.either(l => Either.left(l), r => Either.right(r)));
    }

    mapCollecting<L2, R2>(f: (x: R) => Either<L2, R2>): Either<L | L2, R2> {
        return Either.joinLeft(this.map(f));
    }

    either<T>(onLeft: (l: L) => T, onRight: (r: R) => T): T {
        if (this.isLeft()) {
            return onLeft(this.unwrapLeft());
        } else {
            return onRight(this.unwrapRight());
        }
    }

    /**
     * Only use if you know you have a left value.
     */
    unwrapLeft(): L | never {
        return this.leftValue.unwrap();
    }

    /**
     * Only use if you know you have a right value.
     */
    unwrapRight(): R | never {
        return this.rightValue.unwrap();
    }

    /**
     * Propagate a left value. Only use this if you know the value is a left.
     */
    propLeft<R2>(): Either<L, R2> | never {
        return Either.left(this.unwrapLeft());
    }

    /**
     * Propagate a right value. Only use this if you know the value is a right.
     */
    propRight<L2>(): Either<L2, R> | never {
        return Either.right(this.unwrapRight());
    }

    static pure<L, R>(x: R): Either<L, R> {
        return Either.right(x);
    }

    static fail<L, R>(e: L): Either<L, R> {
        return Either.left(e);
    }

    static left<L, R>(value: L): Either<L, R> {
        return new Either(Maybe.some(value), Maybe.none());
    }

    static right<L, R>(value: R): Either<L, R> {
        return new Either(Maybe.none(), Maybe.some(value));
    }

    static unEither<L>(v: Either<L, L>): L {
        return v.either(x => x, x => x);
    }

    static catEithers<L, R>(es: Either<L, R>[]): Either<L, R[]> {
        const res: R[] = [];
        for (let i = 0; i < es.length; i++) {
            if (es[i].isLeft()) {
                return es[i].propLeft();
            } else {
                res[i] = es[i].unwrapRight();
            }
        }
        return Either.right(res);
    }
}
