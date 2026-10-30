package com.example.studio;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.example.studio.Models.*;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.transaction.*;
import org.springframework.transaction.support.TransactionTemplate;

class TaskServiceTest {

  @TempDir
  Path dir;

  StudioMapper db;
  PlatformTransactionManager manager;
  ExecutorService executor;
  TaskService service;

  @BeforeEach
  void setup() throws Exception {
    db = mock(StudioMapper.class);
    when(db.lockOwner("owner")).thenReturn("owner");
    manager = mock(PlatformTransactionManager.class);
    executor = mock(ExecutorService.class);
    when(manager.getTransaction(any())).thenReturn(
      mock(TransactionStatus.class)
    );
    MediaStore media = new MediaStore(dir.toString());
    Files.writeString(dir.resolve("input.png"), "fixture");
    Template t = new Template();
    t.id = "t";
    t.title = "Test";
    t.requiredImageCount = 1;
    when(db.template("t")).thenReturn(t);
    Asset asset = new Asset();
    asset.storageKey = "input.png";
    when(db.asset("a", "owner")).thenReturn(asset);
    service = new TaskService(
      db,
      new TransactionTemplate(manager),
      executor,
      media,
      true,
      mock(ImageGenerator.class)
    );
  }

  TaskService.Create input() {
    return new TaskService.Create("t", List.of("a"), null);
  }

  @Test
  void deletionBetweenValidationAndCommitPreventsDispatch() {
    Template available = db.template("t");
    Template removed = new Template();
    removed.id="t"; removed.deletedAt=java.time.Instant.now();
    when(db.template("t")).thenReturn(available,removed);
    assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> service.create("owner",input()));
    verify(db,never()).insertTask(any());
    verify(executor,never()).execute(any());
    verify(manager).rollback(any());
  }

  @Test
  void dispatchesOnlyAfterDatabaseCommit() {
    service.create("owner", input());
    var order = inOrder(db, manager, executor);
    order.verify(db).insertTask(any());
    order.verify(manager).commit(any());
    order.verify(executor).execute(any());
  }

  @Test
  void transactionFailureNeverDispatches() {
    doThrow(new IllegalStateException("db unavailable"))
      .when(db)
      .insertTask(any());
    assertThrows(IllegalStateException.class, () ->
      service.create("owner", input())
    );
    verify(executor, never()).execute(any());
    verify(manager).rollback(any());
  }

  @Test
  void queueRejectionRecordsFailureAndSkipsStages() {
    doThrow(new RejectedExecutionException()).when(executor).execute(any());
    service.create("owner", input());
    verify(db).fail(anyString(), eq("EXECUTOR_REJECTED"), anyString());
    verify(db).stopStages(anyString());
    verify(db, never()).claim(anyString());
  }

  @Test
  void restartReconcilesOnlyUnfinishedTasks() {
    Task old = new Task();
    old.id = "unfinished";
    when(db.interrupted()).thenReturn(List.of(old));
    service.reconcile();
    verify(db).fail(eq("unfinished"), eq("EXECUTION_INTERRUPTED"), anyString());
    verify(db).stopStages("unfinished");
    verifyNoInteractions(executor);
  }

  @Test
  void mergedGuestCannotCreateOrDispatchLateTask() {
    when(db.lockOwner("owner")).thenReturn(null);
    assertThrows(
      org.springframework.web.server.ResponseStatusException.class,
      () -> service.create("owner", input())
    );
    verify(db, never()).insertTask(any());
    verify(executor, never()).execute(any());
  }

  @Test
  void duplicateWorkerDoesNotExecuteStages() {
    when(db.claim("done")).thenReturn(0);
    service.run("done");
    verify(db, never()).phase(anyString(), anyString());
  }
}
