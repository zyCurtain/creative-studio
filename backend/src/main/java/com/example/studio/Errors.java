package com.example.studio;

import java.util.Map;
import java.util.UUID;
import org.slf4j.LoggerFactory;
import org.springframework.http.*;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.server.ResponseStatusException;

@RestControllerAdvice
public class Errors {

  @ExceptionHandler(
    {
      HttpMessageNotReadableException.class,
      MissingServletRequestParameterException.class,
      MethodArgumentTypeMismatchException.class,
    }
  )
  ResponseEntity<?> malformed(Exception e) {
    return ResponseEntity.badRequest().body(
      Map.of(
        "code",
        "INVALID_REQUEST",
        "message",
        "请求格式不正确，请检查输入后重试"
      )
    );
  }

  @ExceptionHandler(Exception.class)
  ResponseEntity<?> unexpected(Exception e) {
    if (e instanceof org.springframework.web.ErrorResponse frameworkError) {
      return ResponseEntity.status(frameworkError.getStatusCode()).body(
        Map.of(
          "code",
          "HTTP_" + frameworkError.getStatusCode().value(),
          "message",
          "请求无法处理，请检查路径和参数"
        )
      );
    }
    String id = UUID.randomUUID().toString();
    LoggerFactory.getLogger(Errors.class).error("Request {} failed", id, e);
    return ResponseEntity.internalServerError().body(
      Map.of(
        "code",
        "SERVER_ERROR",
        "message",
        "服务暂时无法完成请求，请稍后重试",
        "requestId",
        id
      )
    );
  }

  @ExceptionHandler(ResponseStatusException.class)
  ResponseEntity<?> status(ResponseStatusException e) {
    return ResponseEntity.status(e.getStatusCode()).body(
      Map.of(
        "code",
        "HTTP_" + e.getStatusCode().value(),
        "message",
        e.getReason() == null ? "请求失败" : e.getReason()
      )
    );
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  ResponseEntity<?> validation(MethodArgumentNotValidException e) {
    return ResponseEntity.badRequest().body(
      Map.of(
        "code",
        "INVALID_INPUT",
        "message",
        "参数不符合要求，请检查输入内容、长度和格式"
      )
    );
  }

  @ExceptionHandler(MaxUploadSizeExceededException.class)
  ResponseEntity<?> size() {
    return ResponseEntity.status(413).body(
      Map.of("code", "FILE_TOO_LARGE", "message", "图片不能超过 5 MiB")
    );
  }
}
