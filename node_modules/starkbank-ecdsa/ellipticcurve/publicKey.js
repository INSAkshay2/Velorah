const BinaryAscii = require("./utils/binary");
const EcdsaCurve = require("./curve");
const Point = require("./point").Point;
const der = require("./utils/der");
const Math = require("./math");
const BigInt = require("big-integer");


const _evenTag = "02";
const _oddTag = "03";


class PublicKey {

    constructor (point, curve) {
        this.point = point;
        this.curve = curve;
    };

    toString (encoded=false) {
        let baseLength = this.curve.length();
        let xString = BinaryAscii.stringFromNumber(this.point.x, baseLength);
        let yString = BinaryAscii.stringFromNumber(this.point.y, baseLength);
        if (encoded) {
            return "\x00\x04" + xString + yString;
        }
        return xString + yString;
    };

    toCompressed () {
        let baseLength = 2 * this.curve.length();
        let parityTag = this.point.y.mod(2).eq(0) ? _evenTag : _oddTag;
        let xHex = this.point.x.toString(16).padStart(baseLength, "0");
        return parityTag + xHex;
    };

    toDer () {
        let encodeEcAndOid = der.encodeSequence(der.encodeOid([1, 2, 840, 10045, 2, 1]), der.encodeOid(this.curve.oid));

        return der.encodeSequence(encodeEcAndOid, der.encodeBitstring(this.toString(true)))
    };

    toPem () {
        return der.toPem(this.toDer(), "PUBLIC KEY")
    };

    static fromPem (string) {
        return this.fromDer(der.fromPem(string));
    };

    static fromDer (string) {
        let result = der.removeSequence(string);
        let s1 = result[0];
        let empty = result[1];
        if (empty) {
            throw new Error("trailing junk after DER public key: " + BinaryAscii.hexFromBinary(empty));
        };

        result = der.removeSequence(s1);
        let s2 = result[0];
        let pointBitString = result[1];

        result = der.removeObject(s2);
        let rest = result[1];

        result = der.removeObject(rest);
        let oidCurve = result[0];
        empty = result[1];
        if (empty) {
            throw new Error("trailing junk after DER public key objects: " + BinaryAscii.hexFromBinary(empty));
        };

        let curve = EcdsaCurve.getByOid(oidCurve);

        result = der.removeBitString(pointBitString);
        let pointStr = result[0];
        empty = result[1];
        if (empty) {
            throw new Error("trailing junk after public key point-string: " + BinaryAscii.hexFromBinary(empty));
        };

        return this.fromString(pointStr.slice(2), curve);
    };

    static fromString (string, curve=EcdsaCurve.secp256k1, validatePoint=true) {
        let baseLength = curve.length();

        let xs = string.slice(null, baseLength);
        let ys = string.slice(baseLength);

        let p = new Point(BinaryAscii.numberFromString(xs), BinaryAscii.numberFromString(ys));

        let publicKey = new PublicKey(p, curve);
        if (!validatePoint) {
            return publicKey;
        }
        if (p.isAtInfinity()) {
            throw new Error("Public Key point is at infinity");
        }
        if (!curve.contains(p)) {
            throw new Error("point (" + p.x + "," + p.y + ") is not valid for curve " + curve.name);
        }
        if (!Math.multiply(p, curve.N, curve.N, curve.A, curve.P).isAtInfinity()) {
            throw new Error("Point (" + p.x + "," + p.y + " * " + curve.name + ".N is not at infinity");
        }
        return publicKey
    };

    static fromCompressed (string, curve=EcdsaCurve.secp256k1) {
        let parityTag = string.slice(0, 2);
        let xHex = string.slice(2);
        if (parityTag !== _evenTag && parityTag !== _oddTag) {
            throw new Error("Compressed string should start with 02 or 03");
        }
        let x = BigInt(xHex, 16);
        let y = curve.y(x, parityTag === _evenTag);
        return new PublicKey(new Point(x, y), curve);
    };
};


exports.PublicKey = PublicKey;
