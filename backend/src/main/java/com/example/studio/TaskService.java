package com.example.studio;

import com.example.studio.Models.*;
import jakarta.annotation.PostConstruct;
import jakarta.validation.constraints.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

@Service
public class TaskService {

  public record Simulation(
    String failAt,
    @Min(0) @Max(60000) Integer delayMs
  ) {}

  public record Create(
    @NotBlank String templateId,
    @NotNull @Size(min = 1, max = 2) List<@NotBlank String> assetIds,
    @jakarta.validation.Valid Simulation simulation
  ) {}

  private final StudioMapper db;
  private final TransactionTemplate tx;
  private final ExecutorService executor;
  private final MediaStore media;
  private final boolean simulationEnabled;
  private final ImageGenerator generator;

  public TaskService(
    StudioMapper db,
    TransactionTemplate tx,
    ExecutorService executor,
    MediaStore media,
    @Value("${studio.simulation-enabled}") boolean simulationEnabled,
    ImageGenerator generator
  ) {
    this.db = db;
    this.tx = tx;
    this.executor = executor;
    this.media = media;
    this.simulationEnabled = simulationEnabled;
    this.generator = generator;
  }

  @PostConstruct
  void reconcile() {
    for (Task t : db.interrupted())
      fail(t.id, "EXECUTION_INTERRUPTED", "服务中断，任务未完成");
  }

  public Task owned(String id, String owner) {
    Task t = db.task(id);
    if (
      t == null || !t.ownerId.equals(owner)
    ) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "任务不存在");
    return t;
  }

  public Task create(String owner, Create input) {
    Template template = db.template(input.templateId());
    if (template == null || template.deletedAt != null || (template.ownerId != null && !template.ownerId.equals(owner))) throw new ResponseStatusException(
      HttpStatus.NOT_FOUND,
      "模板不存在"
    );
    if (
      input.assetIds().size() != template.requiredImageCount
    ) throw new ResponseStatusException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      "图片数量不符合模板要求"
    );
    for (String id : input.assetIds()) {
      Asset a = db.asset(id, owner);
      if (
        a == null || !Files.isReadable(media.path(a.storageKey))
      ) throw new ResponseStatusException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        "素材不可用或不属于当前用户"
      );
    }
    if (
      input.simulation() != null && !simulationEnabled
    ) throw new ResponseStatusException(
      HttpStatus.BAD_REQUEST,
      "开发模拟开关未启用"
    );
    Task t = new Task();
    if (generator.enabled() && input.simulation()!=null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"真实生成模式不接受模拟参数");
    t.generationMode = generator.enabled() ? "BAILIAN" : "SIMULATION";
    t.generationModel = generator.enabled() ? generator.model() : null;
    t.id = UUID.randomUUID().toString();
    t.ownerId = owner;
    t.templateId = template.id;
    t.templateTitle = template.title;
    t.failAt = input.simulation() == null || input.simulation().failAt() == null
      ? "NONE"
      : input.simulation().failAt();
    t.delayMs = input.simulation() == null ||
      input.simulation().delayMs() == null
      ? (generator.enabled() ? 0 : 2000)
      : input.simulation().delayMs();
    if (
      !t.failAt.equals("NONE") && !Pipeline.STAGES.contains(t.failAt)
    ) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "失败阶段无效");
    tx.executeWithoutResult(s -> {
      if (db.lockOwner(owner) == null) throw new ResponseStatusException(
        HttpStatus.CONFLICT,
        "身份已变更，请刷新页面"
      );
      // The initial validation may have raced with deletion. Re-read after the
      // same owner lock used by deletion; accepted tasks retain the stored row.
      Template current = db.template(input.templateId());
      if (current == null || current.deletedAt != null || (current.ownerId != null && !current.ownerId.equals(owner)))
        throw new ResponseStatusException(HttpStatus.NOT_FOUND,"模板已删除或不可用");
      db.insertTask(t);
      for (int i = 0; i < input.assetIds().size(); i++) db.link(
        t.id,
        input.assetIds().get(i),
        i
      );
      for (int i = 0; i < Pipeline.STAGES.size(); i++) db.insertStage(
        t.id,
        Pipeline.STAGES.get(i),
        i
      );
    });
    try {
      executor.execute(() -> run(t.id));
    } catch (RejectedExecutionException e) {
      fail(t.id, "EXECUTOR_REJECTED", "制作队列已满，请稍后创建新任务");
    }
    return db.task(t.id);
  }

  void fail(String id, String code, String message) {
    tx.executeWithoutResult(s -> {
      db.fail(id, code, message);
      db.stopStages(id);
    });
  }

  void run(String id) {
    if (db.claim(id) == 0) return;
    Task task = db.task(id);
    String result = "result-" + id + ".png";
    Path generated = media.path("pending-" + id + ".png");
    try {
      Pipeline.run(
        new Pipeline.Steps() {
          public void begin(String stage) {
            tx.executeWithoutResult(s -> {
              db.phase(id, stage);
              db.stage(id, stage, "RUNNING");
            });
          }

          public void execute(String stage) throws Exception {
            Thread.sleep(task.delayMs);
            if (stage.equals(task.failAt)) throw new IllegalStateException(
              "SIMULATED_FAILURE"
            );
            switch (stage) {
              case "CHECK_ASSETS" -> {
                for (Asset a : db.inputs(id))
                  if (
                    !Files.isReadable(media.path(a.storageKey))
                  ) throw new java.io.IOException("INPUT_MISSING");
              }
              case "GENERATE" -> generator.generate(task, db.template(task.templateId), db.inputs(id), generated);
              case "PACKAGE_RESULT" -> Files.move(
                generated,
                media.path(result),
                StandardCopyOption.REPLACE_EXISTING
              );
              default -> throw new IllegalStateException("Unknown stage");
            }
          }

          public void complete(String stage) {
            tx.executeWithoutResult(s -> {
              db.stage(id, stage, "SUCCEEDED");
              if (stage.equals("PACKAGE_RESULT")) db.succeed(id, result);
            });
          }
        }
      );
    } catch (Exception e) {
      if (e instanceof InterruptedException) Thread.currentThread().interrupt();
      // Do not log upstream response bodies, signed URLs or request credentials.
      LoggerFactory.getLogger(TaskService.class).warn("Task {} failed: {}", id, e instanceof ImageGenerator.Failure f ? f.code : e.getClass().getSimpleName());
      fail(
        id,
        e instanceof ImageGenerator.Failure f ? f.code : "SIMULATED_FAILURE".equals(e.getMessage())
          ? "SIMULATED_FAILURE"
          : "EXECUTION_FAILED",
        e instanceof ImageGenerator.Failure ? e.getMessage() : "SIMULATED_FAILURE".equals(e.getMessage())
          ? "此阶段按开发配置模拟失败"
          : "处理未完成，请检查素材或服务日志"
      );
    } finally {
      try { Files.deleteIfExists(generated); } catch(java.io.IOException ignored) { }
    }
  }
}
