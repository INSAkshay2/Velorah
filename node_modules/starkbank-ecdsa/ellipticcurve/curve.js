//
// Elliptic Curve Equation
//
// y^2 = x^3 + A*x + B (mod P)
//

const BigInt = require("big-integer");
const Point = require("./point").Point;
const {modulo} = require("./utils/integer");
const EcdsaMath = require("./math");


class CurveFp {

    constructor(A, B, P, N, Gx, Gy, name, oid, nistName=null, glvParams=null) {
        this.A = A;
        this.B = B;
        this.P = P;
        this.N = N;
        this.nBitLength = N.bitLength().toJSNumber();
        this.G = new Point(Gx, Gy);
        this.name = name;
        this.nistName = nistName;
        this.oid = oid;
        // GLV endomorphism parameters (only for curves that support one,
        // e.g. secp256k1). null means no endomorphism; fall back to Shamir+JSF.
        this.glvParams = glvParams;
    };

    contains(p) {
        if (p.x.lesser(0) || p.x.greater(this.P.minus(1))) {
            return false;
        }
        if (p.y.lesser(0) || p.y.greater(this.P.minus(1))) {
            return false;
        }
        if (!modulo(p.y.multiply(p.y).minus(p.x.pow(3).add(this.A.multiply(p.x)).add(this.B)), this.P).eq(0)) {
            return false;
        }
        return true;
    };

    length() {
        return (1 + this.N.toString(16).length) >> 1;
    };

    y(x, isEven) {
        let ySquared = modulo(x.modPow(BigInt(3), this.P).add(this.A.multiply(x)).add(this.B), this.P);
        let y = EcdsaMath.modularSquareRoot(ySquared, this.P);
        if (isEven !== y.mod(2).eq(0)) {
            y = this.P.minus(y);
        }
        return y;
    };
};


let _curvesByOid = {};


function add(curve) {
    _curvesByOid[curve.oid] = curve;
}


function getByOid(oid) {
    let curve = _curvesByOid[oid];
    if (!curve) {
        let names = Object.values(_curvesByOid).map((c) => c.name);
        throw new Error(
            "Unknown curve with oid " + oid
            + "; The following are registered: " + names.join(", ")
        );
    }
    return curve;
}


let secp256k1 = new CurveFp(
    BigInt("0000000000000000000000000000000000000000000000000000000000000000", 16),
    BigInt("0000000000000000000000000000000000000000000000000000000000000007", 16),
    BigInt("fffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2f", 16),
    BigInt("fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141", 16),
    BigInt("79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798", 16),
    BigInt("483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8", 16),
    "secp256k1",
    [1, 3, 132, 0, 10],
    null,
    // GLV endomorphism φ((x,y)) = (β·x, y), equivalent to λ·P.
    // Basis vectors from Gauss reduction; used to split a 256-bit scalar k
    // into two ~128-bit scalars (k1, k2) with k ≡ k1 + k2·λ (mod N).
    {
        beta: BigInt("7ae96a2b657c07106e64479eac3434e99cf0497512f58995c1396c28719501ee", 16),
        lambda: BigInt("5363ad4cc05c30e0a5261c028812645a122e22ea20816678df02967c1b23bd72", 16),
        a1: BigInt("3086d221a7d46bcde86c90e49284eb15", 16),
        b1: BigInt("e4437ed6010e88286f547fa90abfe4c3", 16).negate(),
        a2: BigInt("114ca50f7a8e2f3f657c1108d9d44cfd8", 16),
        b2: BigInt("3086d221a7d46bcde86c90e49284eb15", 16),
    }
);

let prime256v1 = new CurveFp(
    BigInt("ffffffff00000001000000000000000000000000fffffffffffffffffffffffc", 16),
    BigInt("5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b", 16),
    BigInt("ffffffff00000001000000000000000000000000ffffffffffffffffffffffff", 16),
    BigInt("ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551", 16),
    BigInt("6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296", 16),
    BigInt("4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5", 16),
    "prime256v1",
    [1, 2, 840, 10045, 3, 1, 7],
    "P-256"
);

let p256 = prime256v1;

add(secp256k1);
add(prime256v1);


exports.CurveFp = CurveFp;
exports.secp256k1 = secp256k1;
exports.prime256v1 = prime256v1;
exports.p256 = p256;
exports.add = add;
exports.getByOid = getByOid;
