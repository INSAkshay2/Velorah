## A lightweight and fast ECDSA implementation

### Overview

This is a pure JS implementation of the Elliptic Curve Digital Signature Algorithm. It is compatible with OpenSSL and uses elegant math such as Jacobian Coordinates to speed up the ECDSA on pure JS.

### Security

starkbank-ecdsa includes the following security features:

- **RFC 6979 deterministic nonces**: Eliminates the catastrophic risk of nonce reuse that leaks private keys
- **Low-S signature normalization**: Prevents signature malleability (BIP-62)
- **Public key on-curve validation**: Blocks invalid-curve attacks during verification
- **Montgomery ladder scalar multiplication**: Constant-operation point multiplication to mitigate timing side channels
- **Hash truncation**: Correctly handles hash functions larger than the curve order (e.g. SHA-512 with secp256k1)

### Installation

To install StarkBank`s ECDSA for Node JS, run:

```sh
npm install starkbank-ecdsa
```

### Curves

We currently support `secp256k1` and `prime256v1` (P-256), but you can add more curves to the project. You just need to use the `curve.add()` function.

### Speed

We ran a test on Node 22.18.0 on a MAC Pro. The libraries were run 100 times and the averages displayed below were obtained:

| Library            | sign          | verify  |
| ------------------ |:-------------:| -------:|
| starkbank-ecdsa    |     1.0ms     |  1.8ms  |

Performance is driven by Jacobian coordinates, a branch-balanced Montgomery ladder for variable-base scalar multiplication, a precomputed affine table of powers-of-two multiples of the generator (`[G, 2G, 4G, ..., 2ⁿG]`) combined with a width-2 NAF of the scalar to eliminate doublings during signing, a mixed affine+Jacobian addition fast path, curve-specific shortcuts in point doubling (A=0 for secp256k1, A=-3 for prime256v1), the secp256k1 GLV endomorphism to split 256-bit scalars into two ~128-bit halves for a 4-scalar simultaneous multi-exponentiation during verification, Shamir's trick with Joint Sparse Form as the fallback path for curves without an efficient endomorphism, and the extended Euclidean algorithm for modular inversion.

### Sample Code

How to sign a json message for [Stark Bank]:

```js
var ellipticcurve = require("starkbank-ecdsa");
var Ecdsa = ellipticcurve.Ecdsa;
var PrivateKey = ellipticcurve.PrivateKey;

// Generate privateKey from PEM string
var privateKey = PrivateKey.fromPem("-----BEGIN EC PARAMETERS-----\nBgUrgQQACg==\n-----END EC PARAMETERS-----\n-----BEGIN EC PRIVATE KEY-----\nMHQCAQEEIODvZuS34wFbt0X53+P5EnSj6tMjfVK01dD1dgDH02RzoAcGBSuBBAAK\noUQDQgAE/nvHu/SQQaos9TUljQsUuKI15Zr5SabPrbwtbfT/408rkVVzq8vAisbB\nRmpeRREXj5aog/Mq8RrdYy75W9q/Ig==\n-----END EC PRIVATE KEY-----\n");

// Create message from json
let message = JSON.stringify({
    "transfers": [
        {
            "amount": 100000000,
            "taxId": "594.739.480-42",
            "name": "Daenerys Targaryen Stormborn",
            "bankCode": "341",
            "branchCode": "2201",
            "accountNumber": "76543-8",
            "tags": ["daenerys", "targaryen", "transfer-1-external-id"]
        }
    ]
});

signature = Ecdsa.sign(message, privateKey);

// Generate Signature in base64. This result can be sent to Stark Bank in the request header as the Digital-Signature parameter.
console.log(signature.toBase64());

// To double check if the message matches the signature, do this:
let publicKey = privateKey.publicKey();

console.log(Ecdsa.verify(message, signature, publicKey));
```

Simple use:

```js
var ellipticcurve = require("starkbank-ecdsa");
var Ecdsa = ellipticcurve.Ecdsa;
var PrivateKey = ellipticcurve.PrivateKey;

// Generate new Keys
let privateKey = new PrivateKey();
let publicKey = privateKey.publicKey();

let message = "My test message";

// Generate Signature
let signature = Ecdsa.sign(message, privateKey);

// To verify if the signature is valid
console.log(Ecdsa.verify(message, signature, publicKey));
```

How to add more curves:

```js
var ellipticcurve = require("starkbank-ecdsa");
var BigInt = require("big-integer");
var curve = require("starkbank-ecdsa/ellipticcurve/curve");
var PublicKey = ellipticcurve.PublicKey;

let newCurve = new curve.CurveFp(
    BigInt("f1fd178c0b3ad58f10126de8ce42435b3961adbcabc8ca6de8fcf353d86e9c00", 16),
    BigInt("ee353fca5428a9300d4aba754a44c00fdfec0c9ae4b1a1803075ed967b7bb73f", 16),
    BigInt("f1fd178c0b3ad58f10126de8ce42435b3961adbcabc8ca6de8fcf353d86e9c03", 16),
    BigInt("f1fd178c0b3ad58f10126de8ce42435b53dc67e140d2bf941ffdd459c6d655e1", 16),
    BigInt("b6b3d4c356c139eb31183d4749d423958c27d2dcaf98b70164c97a2dd98f5cff", 16),
    BigInt("6142e0f7c8b204911f9271f0f3ecef8c2701c307e8e4c9e183115a1554062cfb", 16),
    "frp256v1",
    [1, 2, 250, 1, 223, 101, 256, 1]
);

curve.add(newCurve);

let publicKeyPem = "-----BEGIN PUBLIC KEY-----\nMFswFQYHKoZIzj0CAQYKKoF6AYFfZYIAAQNCAATeEFFYiQL+HmDYTf+QDmvQmWGD\ndRJPqLj11do8okvkSxq2lwB6Ct4aITMlCyg3f1msafc/ROSN/Vgj69bDhZK6\n-----END PUBLIC KEY-----";

let publicKey = PublicKey.fromPem(publicKeyPem);

console.log(publicKey.toPem());
```

How to generate compressed public key:

```js
var ellipticcurve = require("starkbank-ecdsa");
var PrivateKey = ellipticcurve.PrivateKey;
var PublicKey = ellipticcurve.PublicKey;

let privateKey = new PrivateKey();
let publicKey = privateKey.publicKey();
let compressedPublicKey = publicKey.toCompressed();

console.log(compressedPublicKey);
```

How to recover a compressed public key:

```js
var ellipticcurve = require("starkbank-ecdsa");
var PublicKey = ellipticcurve.PublicKey;

let compressedPublicKey = "0252972572d465d016d4c501887b8df303eee3ed602c056b1eb09260dfa0da0ab2";
let publicKey = PublicKey.fromCompressed(compressedPublicKey);

console.log(publicKey.toPem());
```

### OpenSSL

This library is compatible with OpenSSL, so you can use it to generate keys:

```
openssl ecparam -name secp256k1 -genkey -out privateKey.pem
openssl ec -in privateKey.pem -pubout -out publicKey.pem
```

Create a message.txt file and sign it:

```
openssl dgst -sha256 -sign privateKey.pem -out signatureDer.txt message.txt
```

To verify, do this:

```js
var ellipticcurve = require("starkbank-ecdsa");
var Ecdsa = ellipticcurve.Ecdsa;
var Signature = ellipticcurve.Signature;
var PublicKey = ellipticcurve.PublicKey;
var File = ellipticcurve.utils.File;

let publicKeyPem = File.read("publicKey.pem");
let signatureDer = File.read("signatureDer.txt", "binary");
let message = File.read("message.txt");

let publicKey = PublicKey.fromPem(publicKeyPem);
let signature = Signature.fromDer(signatureDer);

console.log(Ecdsa.verify(message, signature, publicKey));
```

You can also verify it on terminal:

```
openssl dgst -sha256 -verify publicKey.pem -signature signatureDer.txt message.txt
```

NOTE: If you want to create a Digital Signature to use with [Stark Bank], you need to convert the binary signature to base64.

```
openssl base64 -in signatureDer.txt -out signatureBase64.txt
```

You can do the same with this library:

```js
var ellipticcurve = require("starkbank-ecdsa");
var Signature = ellipticcurve.Signature;
var File = ellipticcurve.utils.File;

let signatureDer = File.read("signatureDer.txt", "binary");

let signature = Signature.fromDer(signatureDer);

console.log(signature.toBase64());
```

[Stark Bank]: https://starkbank.com

### Run unit tests

```sh
mocha test/testEcdsa.js test/testCurve.js test/testPrivateKey.js test/testPublicKey.js test/testSignature.js test/testOpenSSL.js test/testSignatureWithRecoveryId.js test/testCompPubKey.js test/testRandom.js test/testSecurity.js
```

### Run benchmark

```sh
node benchmark.js
```

[crypto]: https://nodejs.org/api/crypto.html
