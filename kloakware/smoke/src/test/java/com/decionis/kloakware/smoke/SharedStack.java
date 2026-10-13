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
  private static RuntimeException failure;

  private SharedStack() {}

  static synchronized KloakwareStack get() {
    if (failure != null) {
      // The stack failed to start once; every later test class fails the same
      // way at once, rather than building the image and the containers again.
      throw new IllegalStateException("The kloakware stack did not start", failure);
    }
    if (stack == null) {
      KloakwareStack started =
          new KloakwareStack(Path.of(System.getProperty("kloakware.root", "..")));
      try {
        started.start();
      } catch (RuntimeException error) {
        failure = error;
        started.close();
        throw error;
      }
      Runtime.getRuntime().addShutdownHook(new Thread(started::close, "kloakware-stack-close"));
      stack = started;
    }
    return stack;
  }
}
