package com.example.studio;

import static org.junit.jupiter.api.Assertions.*;

import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class PipelineTest {

  @Test
  void executesThreeIndependentBoundariesInOrder() throws Exception {
    List<String> events = new ArrayList<>();
    Pipeline.run(steps(events, null));
    assertEquals(
      List.of(
        "begin:CHECK_ASSETS",
        "execute:CHECK_ASSETS",
        "complete:CHECK_ASSETS",
        "begin:GENERATE",
        "execute:GENERATE",
        "complete:GENERATE",
        "begin:PACKAGE_RESULT",
        "execute:PACKAGE_RESULT",
        "complete:PACKAGE_RESULT"
      ),
      events
    );
  }

  @ParameterizedTest
  @ValueSource(strings = { "CHECK_ASSETS", "GENERATE", "PACKAGE_RESULT" })
  void failureStopsFollowingSteps(String failed) {
    List<String> events = new ArrayList<>();
    assertThrows(IllegalStateException.class, () ->
      Pipeline.run(steps(events, failed))
    );
    assertEquals("execute:" + failed, events.getLast());
    for (String stage : Pipeline.STAGES.subList(
      Pipeline.STAGES.indexOf(failed) + 1,
      3
    ))
      assertFalse(events.contains("begin:" + stage));
    assertFalse(events.contains("complete:" + failed));
  }

  private Pipeline.Steps steps(List<String> events, String fail) {
    return new Pipeline.Steps() {
      public void begin(String stage) {
        events.add("begin:" + stage);
      }

      public void execute(String stage) {
        events.add("execute:" + stage);
        if (stage.equals(fail)) throw new IllegalStateException();
      }

      public void complete(String stage) {
        events.add("complete:" + stage);
      }
    };
  }
}
