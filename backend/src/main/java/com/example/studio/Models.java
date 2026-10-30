package com.example.studio;

import com.fasterxml.jackson.annotation.JsonIgnore;
import java.time.Instant;

public final class Models {

  private Models() {}

  public static class Template {

    public String id, title, category, description, palette;
    public String prompt;
    @JsonIgnore public String ownerId;
    @JsonIgnore public String coverAssetId;
    @JsonIgnore public Instant deletedAt;
    public CoverCredit coverCredit;
    public boolean isCustom() { return ownerId != null; }
    public int requiredImageCount;

    public String getCoverUrl() {
      return "/api/templates/" + id + "/cover";
    }

    public long getMaxFileSizeBytes() {
      return 5242880;
    }

    public String[] getAcceptedMimeTypes() {
      return new String[] { "image/jpeg", "image/png" };
    }
  }

  public record CoverCredit(String title, String author, String source, String license, String licenseUrl) {}

  public static class Asset {

    public String id, originalName, mimeType;

    @JsonIgnore
    public String ownerId;

    @JsonIgnore
    public String storageKey;

    public long sizeBytes;

    public String getPreviewUrl() {
      return "/api/assets/" + id + "/content";
    }
  }

  public static class Task {

    public String id, templateId, templateTitle, status, currentStage, failedStage, errorCode, errorMessage;

    @JsonIgnore
    public String ownerId;

    @JsonIgnore
    public String resultStorageKey;

    @JsonIgnore
    public String failAt;

    @JsonIgnore
    public int delayMs;

    public long version;
    public String generationMode, generationModel;
    public Instant createdAt, updatedAt;

    public String getResultUrl() {
      return "SUCCEEDED".equals(status) ? "/api/tasks/" + id + "/result" : null;
    }
  }

  public static class Stage {

    public String stage, status;
    public Instant startedAt, finishedAt;
  }
}
