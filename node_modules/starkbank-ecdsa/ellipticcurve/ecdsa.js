const crypto = require("crypto");
const BigInt = require("big-integer");

const Math = require("./math");
const Signature = require("./signature").Signature;
const BinaryAscii = require("./utils/binary");
const {RandomInteger, modulo} = require("./utils/integer");


class Ecdsa {

    static sign(message, privateKey, hashfunc = "sha256") {
        let curve = privateKey.curve;
        let byteMessage = crypto.createHash(hashfunc).update(message).digest();
        let numberMessage = BinaryAscii.numberFromHex(byteMessage.toString("hex"), curve.nBitLength);

        let r = BigInt(0), s = BigInt(0), randSignPoint = null;
        let kIterator = RandomInteger.rfc6979(byteMessage, privateKey.secret, curve, hashfunc);
        while (r.eq(0) || s.eq(0)) {
            let randNum = kIterator.next();
            randSignPoint = Math.multiplyGenerator(curve, randNum);
            r = modulo(randSignPoint.x, curve.N);
            s = modulo(numberMessage.add(r.multiply(privateKey.secret)).multiply(Math.inv(randNum, curve.N)), curve.N);
        }
        let recoveryId = randSignPoint.y.and(1).toJSNumber();
        if (randSignPoint.y.greater(curve.N)) {
            recoveryId += 2;
        }
        if (s.greater(curve.N.over(2))) {
            s = curve.N.minus(s);
            recoveryId ^= 1;
        }

        return new Signature(r, s, recoveryId);
    }

    static verify(message, signature, publicKey, hashfunc = "sha256") {
        let curve = publicKey.curve;
        let byteMessage = crypto.createHash(hashfunc).update(message).digest();
        let numberMessage = BinaryAscii.numberFromHex(byteMessage.toString("hex"), curve.nBitLength);

        let r = BigInt(signature.r);
        let s = BigInt(signature.s);

        if (r.lesser(1) || r.greater(curve.N.minus(1))) {
            return false;
        }
        if (s.lesser(1) || s.greater(curve.N.minus(1))) {
            return false;
        }
        if (!curve.contains(publicKey.point)) {
            return false;
        }
        let inv = Math.inv(s, curve.N);
        let v = Math.multiplyAndAdd(
            curve.G, modulo(numberMessage.multiply(inv), curve.N),
            publicKey.point, modulo(r.multiply(inv), curve.N),
            curve.N, curve.A, curve.P, curve,
        );
        if (v.isAtInfinity()) {
            return false;
        }
        return v.x.mod(curve.N).eq(r);
    }
}


module.exports = Ecdsa;
