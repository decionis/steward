package com.decionis.kloakware.migration;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/** The normalised export: one JSON object per line, the file every converter writes and the import reads. */
public final class Export {

  static final ObjectMapper JSON = new ObjectMapper();

  private Export() {}

  public static void write(List<LegacyUser> users, Path target) throws IOException {
    StringBuilder out = new StringBuilder();
    for (LegacyUser user : users) out.append(JSON.writeValueAsString(user)).append('\n');
    Files.writeString(target, out.toString(), StandardCharsets.UTF_8);
  }

  public static List<LegacyUser> read(Path source) throws IOException {
    List<LegacyUser> users = new ArrayList<>();
    for (String line : Files.readAllLines(source, StandardCharsets.UTF_8)) {
      if (line.isBlank() || line.startsWith("#")) continue;
      users.add(JSON.readValue(line, LegacyUser.class));
    }
    return users;
  }
}
