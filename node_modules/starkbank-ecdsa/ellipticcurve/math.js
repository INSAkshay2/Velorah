const Point = require("./point").Point;
const modulo = require("./utils/integer").modulo;
const BigInt = require("big-integer");


class Math {

    static modularSquareRoot(value, prime) {
        // Tonelli-Shanks algorithm for modular square root. Works for all odd primes.

        if (value.eq(0)) {
            return BigInt(0);
        }
        if (prime.eq(2)) {
            return modulo(value, BigInt(2));
        }

        // Factor out powers of 2: prime - 1 = Q * 2^S
        let Q = prime.minus(1);
        let S = 0;
        while (Q.mod(2).eq(0)) {
            Q = Q.over(2);
            S += 1;
        }

        if (S === 1) {  // prime = 3 (mod 4)
            return value.modPow(prime.add(1).over(4), prime);
        }

        // Find a quadratic non-residue z
        let z = BigInt(2);
        while (!z.modPow(prime.minus(1).over(2), prime).eq(prime.minus(1))) {
            z = z.add(1);
        }

        let M = S;
        let c = z.modPow(Q, prime);
        let t = value.modPow(Q, prime);
        let R = value.modPow(Q.add(1).over(2), prime);

        while (true) {
            if (t.eq(1)) {
                return R;
            }

            // Find the least i such that t^(2^i) = 1 (mod prime)
            let i = 1;
            let temp = modulo(t.multiply(t), prime);
            while (!temp.eq(1)) {
                temp = modulo(temp.multiply(temp), prime);
                i += 1;
            }

            let b = c.modPow(BigInt(1).shiftLeft(M - i - 1), prime);
            M = i;
            c = modulo(b.multiply(b), prime);
            t = modulo(t.multiply(c), prime);
            R = modulo(R.multiply(b), prime);
        }
    }

    static multiply(p, n, N, A, P) {
        // Fast way to multiply point and scalar in elliptic curves

        // :param p: First Point to multiply
        // :param n: Scalar to multiply
        // :param N: Order of the elliptic curve
        // :param P: Prime number in the module of the equation Y^2 = X^3 + A*X + B (mod p)
        // :param A: Coefficient of the first-order term of the equation Y^2 = X^3 + A*X + B (mod p)
        // :return: Point that represents the scalar multiplication

        return this._fromJacobian(
            this._jacobianMultiply(this._toJacobian(p), n, N, A, P), P
        );
    }

    static add(p, q, A, P) {
        // Fast way to add two points in elliptic curves

        // :param p: First Point you want to add
        // :param q: Second Point you want to add
        // :param P: Prime number in the module of the equation Y^2 = X^3 + A*X + B (mod p)
        // :param A: Coefficient of the first-order term of the equation Y^2 = X^3 + A*X + B (mod p)
        // :return: Point that represents the sum of First and Second Point

        return this._fromJacobian(
            this._jacobianAdd(this._toJacobian(p), this._toJacobian(q), A, P), P,
        );
    }

    static multiplyAndAdd(p1, n1, p2, n2, N, A, P, curve=null) {
        // Compute n1*p1 + n2*p2. If ``curve`` is given and exposes ``glvParams``
        // (e.g. secp256k1), uses the GLV endomorphism to split both scalars into
        // ~128-bit halves and run a 4-scalar simultaneous multi-exponentiation.
        // Otherwise falls back to Shamir's trick with JSF. Not constant-time —
        // use only with public scalars (e.g. verification).

        // :param p1: First point
        // :param n1: First scalar
        // :param p2: Second point
        // :param n2: Second scalar
        // :param N: Order of the elliptic curve (ignored when ``curve`` is given)
        // :param A: Coefficient of the first-order term (ignored when ``curve`` is given)
        // :param P: Prime defining the field (ignored when ``curve`` is given)
        // :param curve: Optional curve object; enables GLV if ``curve.glvParams`` is set
        // :return: Point n1*p1 + n2*p2

        if (curve != null) {
            N = curve.N; A = curve.A; P = curve.P;
            if (curve.glvParams != null) {
                return this._glvMultiplyAndAdd(p1, n1, p2, n2, curve);
            }
        }
        return this._fromJacobian(
            this._shamirMultiply(
                this._toJacobian(p1), n1,
                this._toJacobian(p2), n2,
                N, A, P,
            ), P,
        );
    }

    static _glvMultiplyAndAdd(p1, n1, p2, n2, curve) {
        // Compute n1*p1 + n2*p2 using the GLV endomorphism. Splits each 256-bit
        // scalar into two ~128-bit scalars via k ≡ k1 + k2·λ (mod N), then runs
        // a 4-scalar simultaneous double-and-add over (p1, φ(p1), p2, φ(p2))
        // with a 16-entry precomputed table of subset sums. Halves the loop
        // length versus the plain Shamir path.

        let glv = curve.glvParams;
        let N = curve.N, A = curve.A, P = curve.P;
        let beta = glv.beta;

        let [k1, k2] = this._glvDecompose(modulo(n1, N), glv, N);
        let [k3, k4] = this._glvDecompose(modulo(n2, N), glv, N);

        // Base points (affine, z=1) — φ((x,y)) = (β·x mod P, y).
        let bases = [
            new Point(p1.x, p1.y, BigInt(1)),
            new Point(modulo(beta.multiply(p1.x), P), p1.y, BigInt(1)),
            new Point(p2.x, p2.y, BigInt(1)),
            new Point(modulo(beta.multiply(p2.x), P), p2.y, BigInt(1)),
        ];
        let scalars = [k1, k2, k3, k4];
        for (let i = 0; i < 4; i++) {
            if (scalars[i].lesser(0)) {
                scalars[i] = scalars[i].negate();
                bases[i] = new Point(bases[i].x, P.minus(bases[i].y), BigInt(1));
            }
        }

        // Precompute table[idx] = sum of bases[i] selected by bits of idx.
        let table = new Array(16);
        table[0] = new Point(BigInt(0), BigInt(0), BigInt(1));
        for (let idx = 1; idx < 16; idx++) {
            let low = idx & -idx;
            let i = 0;
            let tmp = low;
            while (tmp > 1) { tmp >>= 1; i++; }
            table[idx] = this._jacobianAdd(table[idx ^ low], bases[i], A, P);
        }

        let maxLen = 0;
        for (let i = 0; i < 4; i++) {
            let bl = scalars[i].bitLength().toJSNumber();
            if (bl > maxLen) maxLen = bl;
        }

        let r = new Point(BigInt(0), BigInt(0), BigInt(1));
        let s0 = scalars[0], s1 = scalars[1], s2 = scalars[2], s3 = scalars[3];
        for (let bit = maxLen - 1; bit >= 0; bit--) {
            r = this._jacobianDouble(r, A, P);
            let idx =
                s0.shiftRight(bit).and(1).toJSNumber()
                | (s1.shiftRight(bit).and(1).toJSNumber() << 1)
                | (s2.shiftRight(bit).and(1).toJSNumber() << 2)
                | (s3.shiftRight(bit).and(1).toJSNumber() << 3);
            if (idx) {
                r = this._jacobianAdd(r, table[idx], A, P);
            }
        }

        return this._fromJacobian(r, P);
    }

    static _glvDecompose(k, glv, N) {
        // Decompose k into (k1, k2) with k ≡ k1 + k2·λ (mod N) and
        // |k1|, |k2| ~ √N. Babai rounding against the precomputed basis
        // {(a1, b1), (a2, b2)}; k1 and k2 may be negative.

        let a1 = glv.a1, b1 = glv.b1, a2 = glv.a2, b2 = glv.b2;
        let halfN = N.shiftRight(1);
        // dividends are non-negative, so .divide (truncate) equals floor.
        let c1 = b2.multiply(k).add(halfN).divide(N);
        let c2 = b1.negate().multiply(k).add(halfN).divide(N);
        let k1 = k.minus(c1.multiply(a1)).minus(c2.multiply(a2));
        let k2 = c1.negate().multiply(b1).minus(c2.multiply(b2));
        return [k1, k2];
    }

    static multiplyGenerator(curve, n) {
        // Fast scalar multiplication n*G using a precomputed affine table of
        // powers-of-two multiples of G and the width-2 NAF of n. Every non-zero
        // NAF digit triggers one mixed add and zero doublings, trading the ~256
        // doublings of a windowed method for ~86 adds on average — a large net
        // reduction in field multiplications for 256-bit scalars.

        // :param curve: Elliptic curve with generator G
        // :param n: Scalar multiplier
        // :return: Point n*G

        if (n.lesser(0) || n.greaterOrEquals(curve.N)) {
            n = modulo(n, curve.N);
        }
        if (n.eq(0)) {
            return new Point(BigInt(0), BigInt(0), BigInt(0));
        }

        let table = this._generatorPowersTable(curve);
        let A = curve.A, P = curve.P;

        let r = new Point(BigInt(0), BigInt(0), BigInt(1));
        let i = 0;
        let k = n;
        while (k.greater(0)) {
            if (k.and(1).eq(1)) {
                let digit = 2 - k.and(3).toJSNumber();  // -1 or +1
                k = k.minus(digit);
                let g = table[i];
                if (digit === 1) {
                    r = this._jacobianAdd(r, g, A, P);
                } else {
                    r = this._jacobianAdd(r, new Point(g.x, P.minus(g.y), BigInt(1)), A, P);
                }
            }
            k = k.shiftRight(1);
            i += 1;
        }
        return this._fromJacobian(r, P);
    }

    static _generatorPowersTable(curve) {
        // Build [G, 2G, 4G, ..., 2^nBitLength * G] in affine (z=1) form, so each
        // add in multiplyGenerator hits the mixed-add fast path.

        let cached = curve._generatorPowersTable_;
        if (cached) {
            return cached;
        }
        let A = curve.A, P = curve.P;
        let current = new Point(curve.G.x, curve.G.y, BigInt(1));
        let table = [current];
        // NAF of an nBitLength-bit scalar can be up to nBitLength+1 digits.
        for (let i = 0; i < curve.nBitLength; i++) {
            let doubled = this._jacobianDouble(current, A, P);
            if (doubled.y.eq(0)) {
                current = doubled;
            } else {
                let zInv = this.inv(doubled.z, P);
                let zInv2 = modulo(zInv.multiply(zInv), P);
                let zInv3 = modulo(zInv2.multiply(zInv), P);
                current = new Point(
                    modulo(doubled.x.multiply(zInv2), P),
                    modulo(doubled.y.multiply(zInv3), P),
                    BigInt(1),
                );
            }
            table.push(current);
        }
        curve._generatorPowersTable_ = table;
        return table;
    }

    static inv(x, n) {
        // Modular inverse via extended Euclidean algorithm (big-integer's
        // native modInv). Roughly 2-3x faster than Fermat's little theorem
        // for 256-bit operands.

        // :param x: Divisor (must be coprime to n)
        // :param n: Mod for division
        // :return: Value representing the division

        if (x.eq(0)) {
            return BigInt(0);
        }

        return x.modInv(n);
    }

    static _toJacobian(p) {
        // Convert point to Jacobian coordinates

        // :param p: First Point you want to add
        // :return: Point in Jacobian coordinates

        return new Point(p.x, p.y, BigInt(1));
    }

    static _fromJacobian(p, P) {
        // Convert point back from Jacobian coordinates

        // :param p: First Point you want to add
        // :param P: Prime number in the module of the equation Y^2 = X^3 + A*X + B (mod p)
        // :return: Point in default coordinates

        if (p.y.eq(0)) {
            return new Point(BigInt(0), BigInt(0), BigInt(0));
        }

        let z = this.inv(p.z, P);
        let z2 = modulo(z.multiply(z), P);
        let z3 = modulo(z2.multiply(z), P);

        return new Point(
            modulo(p.x.multiply(z2), P),
            modulo(p.y.multiply(z3), P)
        );
    }

    static _jacobianDouble(p, A, P) {
        // Double a point in elliptic curves

        // :param p: Point you want to double
        // :param P: Prime number in the module of the equation Y^2 = X^3 + A*X + B (mod p)
        // :param A: Coefficient of the first-order term of the equation Y^2 = X^3 + A*X + B (mod p)
        // :return: Point that represents the sum of First and Second Point

        let py = p.y;
        if (py.eq(0)) {
            return new Point(BigInt(0), BigInt(0), BigInt(0));
        }

        let px = p.x;
        let pz = p.z;
        let ysq = modulo(py.multiply(py), P);
        let S = modulo(px.multiply(ysq).multiply(4), P);
        let pz2 = modulo(pz.multiply(pz), P);
        let M;
        if (A.eq(0)) {
            // secp256k1: skip the wasted A*pz^4 term
            M = modulo(px.multiply(px).multiply(3), P);
        } else if (A.eq(-3) || A.eq(P.minus(3))) {
            // prime256v1 (A=-3): 3*(px-pz^2)*(px+pz^2) saves one mult
            M = modulo(px.minus(pz2).multiply(px.add(pz2)).multiply(3), P);
        } else {
            M = modulo(px.multiply(px).multiply(3).add(A.multiply(pz2).multiply(pz2)), P);
        }
        let nx = modulo(M.multiply(M).minus(S.multiply(2)), P);
        let ny = modulo(M.multiply(S.minus(nx)).minus(ysq.multiply(ysq).multiply(8)), P);
        let nz = modulo(py.multiply(pz).multiply(2), P);

        return new Point(nx, ny, nz);
    }

    static _jacobianAdd(p, q, A, P) {
        // Add two points in elliptic curves

        // :param p: First Point you want to add
        // :param q: Second Point you want to add
        // :param P: Prime number in the module of the equation Y^2 = X^3 + A*X + B (mod p)
        // :param A: Coefficient of the first-order term of the equation Y^2 = X^3 + A*X + B (mod p)
        // :return: Point that represents the sum of First and Second Point

        if (p.y.eq(0)) {
            return q;
        }
        if (q.y.eq(0)) {
            return p;
        }

        let px = p.x, py = p.y, pz = p.z;
        let qx = q.x, qy = q.y, qz = q.z;

        let pz2 = modulo(pz.multiply(pz), P);
        let U2 = modulo(qx.multiply(pz2), P);
        let S2 = modulo(qy.multiply(pz2).multiply(pz), P);

        let U1, S1;
        if (qz.eq(1)) {
            // Mixed affine+Jacobian add: qz²=qz³=1 saves four multiplications.
            U1 = px;
            S1 = py;
        } else {
            let qz2 = modulo(qz.multiply(qz), P);
            U1 = modulo(px.multiply(qz2), P);
            S1 = modulo(py.multiply(qz2).multiply(qz), P);
        }

        if (U1.eq(U2)) {
            if (S1.neq(S2)) {
                return new Point(BigInt(0), BigInt(0), BigInt(1));
            }
            return this._jacobianDouble(p, A, P);
        }

        let H = U2.minus(U1);
        let R = S2.minus(S1);
        let H2 = modulo(H.multiply(H), P);
        let H3 = modulo(H.multiply(H2), P);
        let U1H2 = modulo(U1.multiply(H2), P);
        let nx = modulo(R.multiply(R).minus(H3).minus(U1H2.multiply(2)), P);
        let ny = modulo(R.multiply(U1H2.minus(nx)).minus(S1.multiply(H3)), P);
        let nz = qz.eq(1) ? modulo(H.multiply(pz), P) : modulo(H.multiply(pz).multiply(qz), P);

        return new Point(nx, ny, nz);
    }

    static _jacobianMultiply(p, n, N, A, P) {
        // Multiply point and scalar in elliptic curves using Montgomery ladder
        // for constant-time execution.

        // :param p: First Point to multiply
        // :param n: Scalar to multiply
        // :param N: Order of the elliptic curve
        // :param P: Prime number in the module of the equation Y^2 = X^3 + A*X + B (mod p)
        // :param A: Coefficient of the first-order term of the equation Y^2 = X^3 + A*X + B (mod p)
        // :return: Point that represents the scalar multiplication

        if (p.y.eq(0) || n.eq(0)) {
            return new Point(BigInt(0), BigInt(0), BigInt(1));
        }

        if (n.lesser(0) || n.greaterOrEquals(N)) {
            n = modulo(n, N);
        }

        if (n.eq(0)) {
            return new Point(BigInt(0), BigInt(0), BigInt(1));
        }

        // Montgomery ladder: always performs one add and one double per bit
        let r0 = new Point(BigInt(0), BigInt(0), BigInt(1));
        let r1 = new Point(p.x, p.y, p.z);

        let bitLen = n.bitLength().toJSNumber();
        for (let i = bitLen - 1; i >= 0; i--) {
            if (n.shiftRight(i).and(1).eq(0)) {
                r1 = this._jacobianAdd(r0, r1, A, P);
                r0 = this._jacobianDouble(r0, A, P);
            } else {
                r0 = this._jacobianAdd(r0, r1, A, P);
                r1 = this._jacobianDouble(r1, A, P);
            }
        }

        return r0;
    }

    static _shamirMultiply(jp1, n1, jp2, n2, N, A, P) {
        // Compute n1*p1 + n2*p2 using Shamir's trick with Joint Sparse Form
        // (Solinas 2001). JSF picks signed digits in {-1, 0, 1} so at most ~l/2
        // digit pairs are non-zero, versus ~3l/4 for the raw binary form. Not
        // constant-time — use only with public scalars (e.g. verification).

        // :param jp1: First point in Jacobian coordinates
        // :param n1: First scalar
        // :param jp2: Second point in Jacobian coordinates
        // :param n2: Second scalar
        // :param N: Order of the elliptic curve
        // :param A: Coefficient of the first-order term of the equation Y^2 = X^3 + A*X + B (mod p)
        // :param P: Prime number in the module of the equation Y^2 = X^3 + A*X + B (mod p)
        // :return: Point n1*p1 + n2*p2 in Jacobian coordinates

        if (n1.lesser(0) || n1.greaterOrEquals(N)) {
            n1 = modulo(n1, N);
        }
        if (n2.lesser(0) || n2.greaterOrEquals(N)) {
            n2 = modulo(n2, N);
        }

        if (n1.eq(0) && n2.eq(0)) {
            return new Point(BigInt(0), BigInt(0), BigInt(1));
        }

        let neg = (pt) => new Point(pt.x, pt.y.eq(0) ? BigInt(0) : P.minus(pt.y), pt.z);

        let jp1p2 = this._jacobianAdd(jp1, jp2, A, P);
        let jp1mp2 = this._jacobianAdd(jp1, neg(jp2), A, P);
        let addTable = {
            "1,0": jp1,
            "-1,0": neg(jp1),
            "0,1": jp2,
            "0,-1": neg(jp2),
            "1,1": jp1p2,
            "-1,-1": neg(jp1p2),
            "1,-1": jp1mp2,
            "-1,1": neg(jp1mp2),
        };

        let digits = this._jsfDigits(n1, n2);
        let r = new Point(BigInt(0), BigInt(0), BigInt(1));
        for (let idx = 0; idx < digits.length; idx++) {
            let u0 = digits[idx][0];
            let u1 = digits[idx][1];
            r = this._jacobianDouble(r, A, P);
            if (u0 || u1) {
                r = this._jacobianAdd(r, addTable[u0 + "," + u1], A, P);
            }
        }

        return r;
    }

    static _jsfDigits(k0, k1) {
        // Joint Sparse Form of (k0, k1): list of signed-digit pairs [u0, u1] in
        // {-1, 0, 1}, ordered MSB-first. At most one of any two consecutive pairs
        // is non-zero, giving density ~1/2 instead of ~3/4 from raw binary.

        let digits = [];
        let d0 = 0;
        let d1 = 0;
        while (!k0.add(d0).eq(0) || !k1.add(d1).eq(0)) {
            let a0 = k0.add(d0);
            let a1 = k1.add(d1);
            let u0;
            if (a0.and(1).eq(1)) {
                u0 = a0.and(3).eq(1) ? 1 : -1;
                let a0mod8 = a0.and(7).toJSNumber();
                if ((a0mod8 === 3 || a0mod8 === 5) && a1.and(3).eq(2)) {
                    u0 = -u0;
                }
            } else {
                u0 = 0;
            }
            let u1;
            if (a1.and(1).eq(1)) {
                u1 = a1.and(3).eq(1) ? 1 : -1;
                let a1mod8 = a1.and(7).toJSNumber();
                if ((a1mod8 === 3 || a1mod8 === 5) && a0.and(3).eq(2)) {
                    u1 = -u1;
                }
            } else {
                u1 = 0;
            }
            digits.push([u0, u1]);
            if (2 * d0 === 1 + u0) {
                d0 = 1 - d0;
            }
            if (2 * d1 === 1 + u1) {
                d1 = 1 - d1;
            }
            k0 = k0.shiftRight(1);
            k1 = k1.shiftRight(1);
        }
        digits.reverse();
        return digits;
    }
}


module.exports = Math;
