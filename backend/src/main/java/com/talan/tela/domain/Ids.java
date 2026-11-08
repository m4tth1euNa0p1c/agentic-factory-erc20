package com.talan.tela.domain;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.HexFormat;
import java.util.UUID;
import org.bouncycastle.crypto.digests.KeccakDigest;

/** Identifiers shared with the chain (D-02). */
public final class Ids {
    private static final SecureRandom RANDOM = new SecureRandom();

    private Ids() {}

    /** RFC 9562 UUIDv7: 48-bit unix ms timestamp, version 7, variant 2, random tail. */
    public static UUID uuidV7() {
        long ms = System.currentTimeMillis();
        long msb = (ms << 16) | 0x7000L | (RANDOM.nextInt() & 0x0FFFL);
        long lsb = (RANDOM.nextLong() & 0x3FFFFFFFFFFFFFFFL) | 0x8000000000000000L;
        return new UUID(msb, lsb);
    }

    /** On-chain reference = keccak256(utf8(operationId)), lowercase 0x-hex. */
    public static String reference(UUID operationId) {
        byte[] in = operationId.toString().getBytes(StandardCharsets.UTF_8);
        KeccakDigest d = new KeccakDigest(256);
        d.update(in, 0, in.length);
        byte[] out = new byte[32];
        d.doFinal(out, 0);
        return "0x" + HexFormat.of().formatHex(out);
    }
}
