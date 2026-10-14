package com.decionis.kloakware.migration;

/**
 * The hash as the legacy system stored it, in the shape the realm's credential
 * takes: the algorithm is a provider the server knows ({@code legacy-ssha} for
 * a directory's salted SHA family, {@code legacy-sha256} for the in-house
 * application's), the digest and the salt base64.
 */
public record LegacyPassword(String algorithm, String hash, String salt) {}
