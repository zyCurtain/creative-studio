package com.example.studio;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.server.ResponseStatusException;

class MediaStoreTest {

  @TempDir
  Path dir;

  @Test
  void forgedAndTruncatedImagesDoNotLeaveFiles() throws Exception {
    var media = new MediaStore(dir.toString());
    for (byte[] bytes : new byte[][] {
      "not an image".getBytes(),
      new byte[] {
        (byte) 137,
        80,
        78,
        71,
        13,
        10,
        26,
        10,
        0,
        0,
        0,
        13,
        73,
        72,
        68,
        82,
      },
    }) {
      var e = assertThrows(ResponseStatusException.class, () ->
        media.upload(
          "owner",
          new MockMultipartFile("file", "bad.png", "image/png", bytes)
        )
      );
      assertEquals(415, e.getStatusCode().value());
    }
    try (var files = Files.list(dir)) {
      assertEquals(0, files.count());
    }
  }

  @Test
  void rejectsTraversal() {
    assertThrows(IllegalArgumentException.class, () ->
      new MediaStore(dir.toString()).path("../private")
    );
  }
}
