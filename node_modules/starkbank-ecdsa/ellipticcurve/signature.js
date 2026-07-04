const BinaryAscii = require("./utils/binary")
const Base64 = require("./utils/base")
const der = require("./utils/der")


class Signature {

    constructor (r, s, recoveryId = null) {
        this.r = r;
        this.s = s;
        this.recoveryId = recoveryId;
    }

    toDer (withRecoveryId = false) {
        let encodedSequence = der.encodeSequence(der.encodeInteger(this.r), der.encodeInteger(this.s));
        if (!withRecoveryId) {
            return encodedSequence;
        }
        return String.fromCharCode(27 + this.recoveryId) + encodedSequence;
    }

    toBase64 (withRecoveryId = false) {
        return Base64.encode(this.toDer(withRecoveryId));
    }

    static fromDer (string, recoveryByte = false) {
        let recoveryId = null;
        if (recoveryByte) {
            if (typeof string[0] === "number") {
                recoveryId = string[0];
            } else {
                recoveryId = string.charCodeAt(0);
            }
            recoveryId -= 27;
            string = string.slice(1);
        }

        let result = der.removeSequence(string);
        let rs = result[0];
        let empty = result[1];
        if (empty) {
            throw new Error("trailing junk after DER signature: " + BinaryAscii.hexFromBinary(empty));
        }

        result = der.removeInteger(rs);
        let r = result[0];
        let rest = result[1];

        result = der.removeInteger(rest);
        let s = result[0];
        empty = result[1];

        if (empty) {
            throw new Error("trailing junk after DER numbers: " + BinaryAscii.hexFromBinary(empty));
        }

        return new Signature(r, s, recoveryId)
    }

    static fromBase64 (string, recoveryByte = false) {
        let derString = Base64.decode(string);
        return this.fromDer(derString, recoveryByte);
    }
}


exports.Signature = Signature;
