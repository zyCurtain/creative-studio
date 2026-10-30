package com.example.studio;

import java.util.concurrent.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;

@SpringBootApplication
public class StudioApplication {

  public static void main(String[] args) {
    SpringApplication.run(StudioApplication.class, args);
  }

  @Bean(destroyMethod = "shutdown")
  ExecutorService taskExecutor(
    @Value("${studio.worker-count:2}") int workers,
    @Value("${studio.queue-capacity:20}") int capacity
  ) {
    if (workers < 1 || capacity < 1) throw new IllegalArgumentException(
      "Worker count and queue capacity must be positive"
    );
    return new ThreadPoolExecutor(
      workers,
      workers,
      0,
      TimeUnit.SECONDS,
      new ArrayBlockingQueue<>(capacity),
      new ThreadPoolExecutor.AbortPolicy()
    );
  }
}
