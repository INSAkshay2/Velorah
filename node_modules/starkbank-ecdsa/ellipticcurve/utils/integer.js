// based on random-number-csprng: https://www.npmjs.com/package/random-number-csprng

const BigInt = require("big-integer");
const crypto = require("crypto");
const BinaryAscii = require("./binary");


function modulo(x, n) {
    let mod = x.divmod(n).remainder;

    if (mod.lesser(0)) {
        mod = mod.add(n);
    }

    return mod;
}


function calculateParameters(range) {
	let bitsNeeded = 0;
	let bytesNeeded = 0;
	let mask = BigInt(1);

	while (range.greater(0)) {
		if (bitsNeeded % 8 === 0) {
			bytesNeeded += 1;
		}

        bitsNeeded += 1;
        mask = mask.shiftLeft(1).or(1);

        range = range.shiftRight(1);
	}

	return {bitsNeeded, bytesNeeded, mask};
}


class RandomInteger {

    static between(min, max) {
        /**
         * Return integer x in the range: min <= x <= max
         *
         * :param min: minimum value of the integer
         * :param max: maximum value of the integer
         * :return:
         */
        if (crypto == null || crypto.randomBytes == null) {
            throw new Error("No suitable random number generator available.");
        }

        if (max.lesserOrEquals(min)) {
            throw new Error("The maximum value must be higher than the minimum value.");
        }

        let range = max.minus(min);

        let {bitsNeeded, bytesNeeded, mask} = calculateParameters(range);

        let randomBytes = crypto.randomBytes(bytesNeeded);

        let randomValue = BigInt(0);

        for (let i = BigInt(0); i.lesser(bytesNeeded); i = i.add(1)) {
            randomValue = randomValue.or(BigInt(randomBytes[i]).shiftLeft(BigInt(8).multiply(i)));
        }

        randomValue = randomValue.and(mask);

        if (randomValue.lesserOrEquals(range)) {
            return min.add(randomValue);
        }

        return this.between(min, max);
    }

    static rfc6979(hashBytes, secret, curve, hashfunc) {
        /**
         * Generate nonce values via hedged RFC 6979: deterministic k derivation
         * with fresh random entropy mixed into K-init (RFC 6979 §3.6). Same
         * message + key yield different signatures, while preserving RFC 6979's
         * protection against RNG failures.
         * Returns an iterator that yields BigInt nonce candidates.
         */
        let orderBitLen = curve.nBitLength;
        let orderByteLen = (orderBitLen + 7) >> 3;

        let secretHex = secret.toString(16).padStart(orderByteLen * 2, "0");
        let secretBytes = Buffer.from(secretHex, "hex");

        let hashReduced = modulo(BinaryAscii.numberFromHex(hashBytes.toString("hex"), orderBitLen), curve.N);
        let hashHex = hashReduced.toString(16).padStart(orderByteLen * 2, "0");
        let hashOctets = Buffer.from(hashHex, "hex");

        let extraEntropy = crypto.randomBytes(orderByteLen);

        let hLen = _hashDigestSize(hashfunc);
        let V = Buffer.alloc(hLen, 0x01);
        let K = Buffer.alloc(hLen, 0x00);

        K = _hmac(hashfunc, K, Buffer.concat([V, Buffer.from([0x00]), secretBytes, hashOctets, extraEntropy]));
        V = _hmac(hashfunc, K, V);
        K = _hmac(hashfunc, K, Buffer.concat([V, Buffer.from([0x01]), secretBytes, hashOctets, extraEntropy]));
        V = _hmac(hashfunc, K, V);

        return {
            next: function () {
                while (true) {
                    let T = Buffer.alloc(0);
                    while (T.length * 8 < orderBitLen) {
                        V = _hmac(hashfunc, K, V);
                        T = Buffer.concat([T, V]);
                    }

                    let k = BinaryAscii.numberFromHex(T.toString("hex"), orderBitLen);

                    if (k.greaterOrEquals(1) && k.lesserOrEquals(curve.N.minus(1))) {
                        return k;
                    }

                    K = _hmac(hashfunc, K, Buffer.concat([V, Buffer.from([0x00])]));
                    V = _hmac(hashfunc, K, V);
                }
            }
        };
    }
}


function _hmac(hashfunc, key, data) {
    let alg = typeof hashfunc === "string" ? hashfunc : "sha256";
    return crypto.createHmac(alg, key).update(data).digest();
}


function _hashDigestSize(hashfunc) {
    let alg = typeof hashfunc === "string" ? hashfunc : "sha256";
    return crypto.createHash(alg).digest().length;
}


exports.RandomInteger = RandomInteger;
exports.modulo = modulo;
