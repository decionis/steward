package com.decionis.kloakware.smoke;

import java.io.IOException;
import java.net.CookieHandler;
import java.net.HttpCookie;
import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * The cookie jar of a browser pointed at a trustworthy origin. Keycloak sets
 * its authentication cookies with {@code Secure; SameSite=None} even over
 * plain HTTP, and browsers accept and return them on {@code localhost} and
 * {@code 127.0.0.1} because those origins are potentially trustworthy. The
 * JDK's {@link java.net.CookieManager} has no such exception: it stores the
 * cookies and never sends them to an {@code http://} URL, so the second step
 * of the login fails with "Restart login cookie not found". This jar keeps one
 * cookie per host, name and path, honours deletion, and ignores the Secure
 * flag, which is exactly the browser's behaviour on a laptop.
 */
final class TrustingCookieJar extends CookieHandler {

  private final Map<String, Map<String, HttpCookie>> byHost = new LinkedHashMap<>();

  @Override
  public synchronized Map<String, List<String>> get(URI uri, Map<String, List<String>> requestHeaders)
      throws IOException {
    Map<String, HttpCookie> jar = byHost.getOrDefault(uri.getHost(), Map.of());
    String path = uri.getPath() == null || uri.getPath().isEmpty() ? "/" : uri.getPath();
    List<String> pairs = new ArrayList<>();
    for (HttpCookie cookie : jar.values()) {
      if (cookie.hasExpired()) continue;
      String cookiePath = cookie.getPath() == null ? "/" : cookie.getPath();
      if (path.startsWith(cookiePath)) pairs.add(cookie.getName() + "=" + cookie.getValue());
    }
    return pairs.isEmpty() ? Map.of() : Map.of("Cookie", List.of(String.join("; ", pairs)));
  }

  @Override
  public synchronized void put(URI uri, Map<String, List<String>> responseHeaders) throws IOException {
    Map<String, HttpCookie> jar = byHost.computeIfAbsent(uri.getHost(), host -> new LinkedHashMap<>());
    for (Map.Entry<String, List<String>> header : responseHeaders.entrySet()) {
      if (header.getKey() == null || !header.getKey().equalsIgnoreCase("Set-Cookie")) continue;
      for (String value : header.getValue()) {
        for (HttpCookie cookie : HttpCookie.parse(value)) {
          // One cookie per name and path: two realms on one host set cookies
          // of the same name under their own paths, and both must survive.
          String key = cookie.getName() + "|" + (cookie.getPath() == null ? "/" : cookie.getPath());
          if (cookie.getMaxAge() == 0) jar.remove(key);
          else jar.put(key, cookie);
        }
      }
    }
  }

  @Override
  public String toString() {
    return byHost.entrySet().stream()
        .map(e -> e.getKey() + ": " + String.join(", ", e.getValue().keySet()))
        .collect(Collectors.joining("; "));
  }
}
