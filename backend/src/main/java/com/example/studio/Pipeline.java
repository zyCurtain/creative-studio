package com.example.studio;

import java.util.List;

/** Ordered execution has explicit observable boundaries and stops at the first exception. */
public final class Pipeline {

  public static final List<String> STAGES = List.of(
    "CHECK_ASSETS",
    "GENERATE",
    "PACKAGE_RESULT"
  );

  public interface Steps {
    void begin(String stage);
    void execute(String stage) throws Exception;
    void complete(String stage);
  }

  public static void run(Steps steps) throws Exception {
    for (String stage : STAGES) {
      steps.begin(stage);
      steps.execute(stage);
      steps.complete(stage);
    }
  }

  private Pipeline() {}
}
