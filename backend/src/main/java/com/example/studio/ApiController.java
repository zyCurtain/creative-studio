package com.example.studio;

import com.example.studio.Models.*;
import jakarta.servlet.http.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.io.IOException;
import java.nio.file.*;
import java.util.*;
import org.springframework.core.io.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
public class ApiController {

  private final StudioMapper db;
  private final Identity identity;
  private final MediaStore media;
  private final TaskService tasks;
  private final ImageGenerator generator;
  private final TemplateCovers covers;

  public ApiController(
    StudioMapper db,
    Identity identity,
    MediaStore media,
    TaskService tasks,
    ImageGenerator generator,
    TemplateCovers covers
  ) {
    this.db = db;
    this.identity = identity;
    this.media = media;
    this.tasks = tasks;
    this.generator = generator;
    this.covers = covers;
  }

  @GetMapping("/generation/config")
  Map<String,Object> generationConfig() { return generator.configuration(); }

  @ModelAttribute
  void noCache(HttpServletResponse res) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
  }

  @PostMapping("/session")
  Identity.View session(HttpServletRequest req, HttpServletResponse res) {
    return identity.create(req, res);
  }

  public record Register(
    @NotBlank @Email @Size(max = 254) String email,
    @NotBlank @Size(max = 40) String displayName,
    @NotNull @Size(min = 10, max = 72) String password
  ) {}

  public record Login(
    @NotBlank @Email @Size(max = 254) String email,
    @NotNull @Size(min = 10, max = 72) String password
  ) {}

  @PostMapping("/auth/register")
  @ResponseStatus(HttpStatus.CREATED)
  Identity.View register(
    HttpServletRequest req,
    HttpServletResponse res,
    @Valid @RequestBody Register input
  ) {
    return identity.register(
      req,
      res,
      input.email(),
      input.displayName(),
      input.password()
    );
  }

  @PostMapping("/auth/login")
  Identity.View login(
    HttpServletRequest req,
    HttpServletResponse res,
    @Valid @RequestBody Login input
  ) {
    return identity.login(req, res, input.email(), input.password());
  }

  @PostMapping("/auth/logout")
  Identity.View logout(HttpServletRequest req, HttpServletResponse res) {
    return identity.logout(req, res);
  }

  @PostMapping("/auth/bind")
  Identity.View bind(HttpServletRequest req) {
    return identity.bind(req);
  }

  @GetMapping("/categories")
  List<String> categories(HttpServletRequest req) {
    return db
      .templates(identity.currentOwner(req))
      .stream()
      .map(t -> t.category)
      .distinct()
      .toList();
  }

  @GetMapping("/templates")
  List<Template> templates(HttpServletRequest req, @RequestParam(required = false) String category) {
    return db
      .templates(identity.currentOwner(req))
      .stream()
      .filter(t -> category == null || category.equals(t.category))
      .map(covers::decorate)
      .toList();
  }

  @GetMapping("/templates/{id}")
  Template template(HttpServletRequest req, @PathVariable String id) {
    Template t = db.template(id);
    if (t == null || t.deletedAt != null || (t.ownerId != null && !t.ownerId.equals(identity.currentOwner(req)))) throw new ResponseStatusException(
      HttpStatus.NOT_FOUND,
      "模板不存在"
    );
    return covers.decorate(t);
  }

  public record NewTemplate(
    @NotBlank @Size(max=80) String title,
    @NotBlank @Size(max=400) String description,
    @NotBlank @Size(max=1000) String prompt,
    @Min(1) @Max(2) int requiredImageCount,
    @NotBlank @Size(max=36) String coverAssetId
  ) {}

  @PostMapping("/templates/{id}/delete")
  @org.springframework.transaction.annotation.Transactional
  Map<String,Boolean> deleteTemplate(HttpServletRequest req, @PathVariable String id) {
    String owner = identity.requireAccount(req);
    // Serialize deletion with task acceptance for this owner.
    if (db.lockOwner(owner) == null) throw new ResponseStatusException(HttpStatus.CONFLICT,"身份已变更，请刷新页面");
    if (db.deleteTemplate(id,owner) != 1) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"模板不存在、已删除或不属于当前账户");
    return Map.of("deleted",true);
  }

  @PostMapping("/templates")
  @ResponseStatus(HttpStatus.CREATED)
  @org.springframework.transaction.annotation.Transactional
  Template createTemplate(HttpServletRequest req, @Valid @RequestBody NewTemplate input) {
    String owner = identity.requireAccount(req);
    if (db.lockOwner(owner) == null) throw new ResponseStatusException(HttpStatus.CONFLICT,"身份已变更，请刷新页面");
    Asset cover = db.asset(input.coverAssetId(),owner);
    if (cover == null || !Files.isReadable(media.path(cover.storageKey))) throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,"请选择属于自己的有效封面图片");
    Template t = new Template();
    t.id = UUID.randomUUID().toString(); t.title = input.title().strip(); t.description = input.description().strip();
    t.prompt = input.prompt().strip(); t.requiredImageCount = input.requiredImageCount();
    t.ownerId = owner; t.coverAssetId = cover.id; t.category = "我的模板"; t.palette = "teal";
    db.insertTemplate(t);
    return t;
  }

  @GetMapping("/templates/{id}/cover")
  ResponseEntity<Resource> cover(HttpServletRequest req, @PathVariable String id) throws IOException {
    Template t = template(req,id);
    if (t.coverAssetId != null) {
      Asset asset = db.asset(t.coverAssetId,t.ownerId);
      if (asset == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"封面暂不可用");
      return file(media.path(asset.storageKey),asset.mimeType);
    }
    Resource photo = covers.resource(t);
    if (photo != null) return ResponseEntity.ok().contentType(MediaType.IMAGE_JPEG).cacheControl(CacheControl.noStore()).body(photo);
    return file(media.cover(t), "image/png");
  }

  @PostMapping("/assets")
  @org.springframework.transaction.annotation.Transactional
  @ResponseStatus(HttpStatus.CREATED)
  Asset upload(HttpServletRequest req, @RequestParam MultipartFile file)
    throws IOException {
    Asset a = media.upload(identity.require(req), file);
    try {
      if (db.lockOwner(a.ownerId) == null) throw new ResponseStatusException(
        HttpStatus.CONFLICT,
        "身份已变更，请刷新页面"
      );
      db.insertAsset(a);
    } catch (RuntimeException e) {
      Files.deleteIfExists(media.path(a.storageKey));
      throw e;
    }
    return a;
  }

  @GetMapping("/assets/{id}/content")
  ResponseEntity<Resource> asset(
    HttpServletRequest req,
    @PathVariable String id
  ) {
    Asset a = db.asset(id, identity.require(req));
    if (a == null) throw new ResponseStatusException(
      HttpStatus.NOT_FOUND,
      "素材不存在"
    );
    return file(media.path(a.storageKey), a.mimeType);
  }

  @PostMapping("/tasks")
  @ResponseStatus(HttpStatus.ACCEPTED)
  Task create(
    HttpServletRequest req,
    @Valid @RequestBody TaskService.Create input
  ) {
    return tasks.create(identity.require(req), input);
  }

  @GetMapping("/tasks/{id}")
  Map<String, Object> task(HttpServletRequest req, @PathVariable String id) {
    Task t = tasks.owned(id, identity.require(req));
    return Map.of("task", t, "stages", db.stages(id));
  }

  @PostMapping("/tasks/{id}/delete")
  Map<String, Boolean> delete(HttpServletRequest req, @PathVariable String id) {
    String owner = identity.require(req);
    tasks.owned(id, owner);
    if (db.deleteTask(id, owner) != 1) throw new ResponseStatusException(HttpStatus.CONFLICT, "只能删除已结束的制作记录，请刷新后重试");
    return Map.of("deleted", true);
  }

  @GetMapping("/tasks")
  Map<String, Object> history(
    HttpServletRequest req,
    @RequestParam(required = false) String templateId,
    @RequestParam(defaultValue = "0") int page
  ) {
    if (page < 0 || page > 100000) throw new ResponseStatusException(
      HttpStatus.BAD_REQUEST,
      "页码无效"
    );
    List<Task> rows = db.history(
      identity.require(req),
      templateId,
      false,
      21,
      page * 20
    );
    return Map.of(
      "items",
      rows.stream().limit(20).toList(),
      "hasMore",
      rows.size() > 20
    );
  }

  @GetMapping("/tasks/active")
  List<Task> active(
    HttpServletRequest req,
    @RequestParam(required = false) String templateId
  ) {
    return db.history(identity.require(req), templateId, true, 1000, 0);
  }

  public record Query(
    @NotNull @Size(min = 1, max = 50) List<@NotBlank String> taskIds
  ) {}

  @PostMapping("/tasks/status-query")
  List<Task> query(HttpServletRequest req, @Valid @RequestBody Query query) {
    String owner = identity.require(req);
    return query
      .taskIds()
      .stream()
      .map(id -> tasks.owned(id, owner))
      .toList();
  }

  @GetMapping("/tasks/{id}/result")
  ResponseEntity<Resource> result(
    HttpServletRequest req,
    @PathVariable String id
  ) {
    Task t = tasks.owned(id, identity.require(req));
    if (!"SUCCEEDED".equals(t.status)) throw new ResponseStatusException(
      HttpStatus.NOT_FOUND,
      "结果尚未就绪"
    );
    return file(media.path(t.resultStorageKey), "image/png");
  }

  private ResponseEntity<Resource> file(Path path, String mime) {
    if (!Files.isReadable(path)) throw new ResponseStatusException(
      HttpStatus.NOT_FOUND,
      "图片暂不可用"
    );
    return ResponseEntity.ok()
      .contentType(MediaType.parseMediaType(mime))
      .cacheControl(CacheControl.noStore())
      .body(new FileSystemResource(path));
  }
}
