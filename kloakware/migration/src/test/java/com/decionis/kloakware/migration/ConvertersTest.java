package com.decionis.kloakware.migration;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.decionis.kloakware.hash.LegacySha256;
import com.decionis.kloakware.hash.LegacySsha;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;
import java.util.List;
import org.junit.jupiter.api.Test;

/** The two fixtures converted, read back, and their hashes verified with the providers the server runs. */
class ConvertersTest {

  private static final Path FIXTURES = Path.of(System.getProperty("kloakware.fixtures", "fixtures"));

  @Test
  void theSiteMinderDirectoryExportBecomesUsersWithTheirSaltedSha() throws Exception {
    LdifConverter.Result result =
        new LdifConverter().convert(Files.readString(FIXTURES.resolve("siteminder/users.ldif"), StandardCharsets.UTF_8));
    assertEquals(5, result.users().size(), result.leftOut().toString());
    assertEquals(List.of(), result.leftOut());

    LegacyUser maria = result.users().get(0);
    assertEquals("maria.legacy", maria.username());
    assertEquals("maria.legacy@example.test", maria.email());
    assertEquals("Maria", maria.firstName());
    assertEquals("SE", maria.market());
    assertEquals(List.of("steward-operator"), maria.roles());
    assertEquals(LegacySsha.ALGORITHM, maria.password().algorithm());
    assertTrue(LegacySsha.verify("Siteminder-Sign-In-2026!", maria.password().salt(), maria.password().hash()));

    LegacyUser omar = result.users().get(1);
    assertEquals(List.of("steward-approver", "steward-operator"), omar.roles());
    assertTrue(LegacySsha.verify("Siteminder-Sign-In-2026!", omar.password().salt(), omar.password().hash()), "SSHA256");
    LegacyUser nina = result.users().get(2);
    assertEquals(List.of(), nina.roles());
    assertTrue(LegacySsha.verify("Siteminder-Sign-In-2026!", nina.password().salt(), nina.password().hash()), "SSHA512");
  }

  @Test
  void anEntryWithoutAUsablePasswordIsLeftOutAndNamed() {
    String ldif =
        "dn: uid=plain,ou=people,dc=x\nuid: plain\nmail: plain@example.test\nuserPassword: {MD5}abcd\n\n"
            + "dn: uid=ok,ou=people,dc=x\nuid: ok\nuserPassword:: "
            + Base64.getEncoder().encodeToString("{SSHA}NCM/q8zh7nYlPP2M8gigDhy1e+AwMTIzNDU2Nzg5YWI=".getBytes(StandardCharsets.UTF_8))
            + "\n";
    LdifConverter.Result result = new LdifConverter().convert(ldif);
    assertEquals(1, result.users().size());
    assertEquals("ok", result.users().get(0).username());
    assertEquals(1, result.leftOut().size());
    assertTrue(result.leftOut().get(0).startsWith("plain:"), result.leftOut().toString());
  }

  @Test
  void theSqlTableExportBecomesUsersWithTheApplicationsSaltedSha256() throws Exception {
    CsvConverter.Result result =
        new CsvConverter().convert(Files.readString(FIXTURES.resolve("in-house-sql/users.csv"), StandardCharsets.UTF_8));
    assertEquals(2, result.users().size());
    LegacyUser pavel = result.users().get(0);
    assertEquals("pavel.legacy", pavel.username());
    assertEquals("NG", pavel.market());
    assertEquals(List.of("steward-operator"), pavel.roles(), "the prefix is added");
    assertEquals(LegacySha256.ALGORITHM, pavel.password().algorithm());
    assertTrue(LegacySha256.verify("Oracle-Sign-In-2026!", pavel.password().salt(), pavel.password().hash()));
    assertEquals(List.of("steward-audits", "steward-viewer"), result.users().get(1).roles());
  }

  @Test
  void theExportRoundTripsAsOneObjectPerLine() throws Exception {
    LegacyUser user =
        new LegacyUser("a", "a@example.test", "A", "B", "SE", List.of("steward-viewer"), new LegacyPassword("legacy-sha256", "aGFzaA==", "c2FsdA=="));
    Path file = Files.createTempFile("export", ".jsonl");
    Export.write(List.of(user), file);
    assertEquals(List.of(user), Export.read(file));
    assertEquals(1, Files.readAllLines(file).size());
  }

  @Test
  void quotedCsvFieldsAndRoleNamesAreHandled() {
    assertEquals(List.of("a", "b,c", "d\"e", ""), CsvConverter.fields("a,\"b,c\",\"d\"\"e\","));
    assertEquals("steward-operator", LegacyUser.realmRole(" operator "));
    assertEquals("steward-operator", LegacyUser.realmRole("steward-operator"));
    assertEquals("operators", LdifConverter.rdnValue("cn=operators,ou=groups,dc=x", "cn"));
  }
}
