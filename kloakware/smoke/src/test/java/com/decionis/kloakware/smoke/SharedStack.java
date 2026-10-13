package com.decionis.kloakware.smoke;

import java.nio.file.Path;

/**
 * One stack for every test class in the JVM. Building the image and starting
 * the containers is the expensive part of the run; the tests that follow read
 * from the same realm and never change it in a way another test could see,
 * except {@link RealmConvergenceTest}, which puts it back.
 */
final class SharedStack {

  private static KloakwareStack stack;

  private SharedStack() {}

  static synchronized KloakwareStack get() {
    if (stack == null) {
      KloakwareStack started =
          new KloakwareStack(Path.of(System.getProperty("kloakware.root", "..")));
      started.start();
      Runtime.getRuntime().addShutdownHook(new Thread(started::close, "kloakware-stack-close"));
      stack = started;
    }
    return stack;
  }
}
