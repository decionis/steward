package com.decionis.kloakware.users;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Properties;

/**
 * Steward's {@code users} table over JDBC: the PostgreSQL driver the server
 * ships, one short-lived connection per call with a login timeout, and the
 * one SELECT in {@code steward-users.sql}, which Steward's own test pins.
 * Nothing here writes: Steward owns its users, kloakware reads them.
 */
public final class StewardUsers {

  private static final String SELECT = load("steward-users.sql");
  private static final int LOGIN_TIMEOUT_SECONDS = 5;

  private final String url;
  private final Properties credentials = new Properties();

  public StewardUsers(String url, String user, String password) {
    this.url = url;
    credentials.setProperty("user", user == null ? "" : user);
    credentials.setProperty("password", password == null ? "" : password);
    credentials.setProperty("loginTimeout", Integer.toString(LOGIN_TIMEOUT_SECONDS));
    credentials.setProperty("socketTimeout", "10");
    credentials.setProperty("ApplicationName", "kloakware-steward-users");
  }

  public Optional<StewardUser> byEmail(String email) throws SQLException {
    if (email == null || email.isBlank()) return Optional.empty();
    return one(SELECT + " WHERE lower(email) = ?", email.toLowerCase(Locale.ROOT));
  }

  public Optional<StewardUser> byId(String id) throws SQLException {
    if (id == null || id.isBlank()) return Optional.empty();
    return one(SELECT + " WHERE id = ?", id);
  }

  /** Users whose email or display name contains the text, for the admin console's search. */
  public List<StewardUser> search(String text, int first, int max) throws SQLException {
    String like = "%" + (text == null ? "" : text.strip().toLowerCase(Locale.ROOT)) + "%";
    List<StewardUser> users = new ArrayList<>();
    try (Connection connection = connect();
        PreparedStatement statement =
            connection.prepareStatement(
                SELECT
                    + " WHERE lower(email) LIKE ? OR lower(display_name) LIKE ?"
                    + " ORDER BY email OFFSET ? ROWS FETCH NEXT ? ROWS ONLY")) {
      statement.setString(1, like);
      statement.setString(2, like);
      statement.setInt(3, Math.max(first, 0));
      statement.setInt(4, max <= 0 ? 100 : max);
      try (ResultSet rows = statement.executeQuery()) {
        while (rows.next()) users.add(read(rows));
      }
    }
    return users;
  }

  public int count() throws SQLException {
    try (Connection connection = connect();
        PreparedStatement statement = connection.prepareStatement("SELECT count(*) FROM users");
        ResultSet rows = statement.executeQuery()) {
      return rows.next() ? rows.getInt(1) : 0;
    }
  }

  private Optional<StewardUser> one(String sql, String parameter) throws SQLException {
    try (Connection connection = connect();
        PreparedStatement statement = connection.prepareStatement(sql)) {
      statement.setString(1, parameter);
      try (ResultSet rows = statement.executeQuery()) {
        return rows.next() ? Optional.of(read(rows)) : Optional.empty();
      }
    }
  }

  private Connection connect() throws SQLException {
    DriverManager.setLoginTimeout(LOGIN_TIMEOUT_SECONDS);
    return DriverManager.getConnection(url, credentials);
  }

  static StewardUser read(ResultSet rows) throws SQLException {
    return new StewardUser(
        rows.getString("id"),
        rows.getString("email"),
        rows.getString("display_name"),
        rows.getString("password_hash"),
        roles(rows.getString("roles")),
        rows.getString("status"));
  }

  /** Steward stores roles as one comma-separated string. */
  static List<String> roles(String csv) {
    if (csv == null || csv.isBlank()) return List.of();
    return Arrays.stream(csv.split(",")).map(String::strip).filter(s -> !s.isEmpty()).toList();
  }

  private static String load(String resource) {
    try (InputStream in = StewardUsers.class.getResourceAsStream(resource)) {
      if (in == null) throw new IllegalStateException(resource + " is missing from the JAR");
      return Arrays.stream(new String(in.readAllBytes(), StandardCharsets.UTF_8).split("\n"))
          .filter(line -> !line.startsWith("--") && !line.isBlank())
          .findFirst()
          .orElseThrow()
          .strip();
    } catch (IOException e) {
      throw new IllegalStateException(resource + " could not be read", e);
    }
  }
}
