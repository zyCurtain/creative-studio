package com.example.studio;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import com.example.studio.Models.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.awt.image.BufferedImage;
import java.io.*;
import java.net.http.*;
import java.nio.ByteBuffer;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.Flow;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;

class ImageGeneratorTest {
  @TempDir Path dir;
  MediaStore media; HttpClient client; Template template; Task task;
  ObjectMapper json=new ObjectMapper();
  @BeforeEach void setup() throws Exception {
    media=new MediaStore(dir.toString()); client=mock(HttpClient.class);
    template=new Template();template.id="duo-collage";template.palette="teal";template.category="创意拼贴";
    task=new Task();task.generationMode="BAILIAN";task.generationModel="qwen-image-2.0-pro";
  }
  ImageGenerator generator(String key) { return new ImageGenerator(media,json,key,"qwen-image-2.0-pro","https://dashscope.aliyuncs.com/compatible-mode/v1",client); }
  @SuppressWarnings("unchecked")
  HttpResponse<byte[]> response(int status,byte[] bytes) {
    HttpResponse<byte[]> result=mock(HttpResponse.class);when(result.statusCode()).thenReturn(status);when(result.body()).thenReturn(bytes);return result;
  }
  byte[] image() throws Exception {
    var out=new ByteArrayOutputStream();ImageIO.write(new BufferedImage(16,16,BufferedImage.TYPE_INT_RGB),"png",out);return out.toByteArray();
  }
  byte[] result(String url) throws Exception { return json.writeValueAsBytes(Map.of("output",Map.of("choices",List.of(Map.of("message",Map.of("content",List.of(Map.of("image",url)))))))); }
  @Test void emptyKeyUsesSimulationWithoutNetwork() throws Exception {
    var generator=generator(" \n "); assertFalse(generator.enabled());task.generationMode="SIMULATION";
    generator.generate(task,template,List.of(),dir.resolve("out.png"));
    assertNotNull(ImageIO.read(dir.resolve("out.png").toFile()));verifyNoInteractions(client);
  }
  @Test void sendsTwoImagesAndDownloadsWithoutCredential() throws Exception {
    template.id="personal-template";
    template.prompt="用两张照片制作暖色胶片双图拼贴，保留两位主角。";
    var requests=new ArrayList<HttpRequest>();
    byte[] metadata=result("https://example.oss-cn-beijing.aliyuncs.com/result.png"); byte[] png=image();
    when(client.sendAsync(any(HttpRequest.class),org.mockito.ArgumentMatchers.<HttpResponse.BodyHandler<byte[]>>any())).thenAnswer(invocation->{
      requests.add(invocation.getArgument(0));
      return CompletableFuture.completedFuture(response(200,requests.size()==1?metadata:png));
    });
    Asset a=new Asset();a.storageKey="input.png";a.mimeType="image/png";Files.write(media.path(a.storageKey),png);
    generator("test-secret").generate(task,template,List.of(a,a),dir.resolve("out.png"));
    assertEquals(2,requests.size());
    assertEquals("/api/v1/services/aigc/multimodal-generation/generation",requests.getFirst().uri().getPath());
    assertEquals("Bearer test-secret",requests.getFirst().headers().firstValue("Authorization").orElseThrow());
    assertTrue(requests.get(1).headers().firstValue("Authorization").isEmpty());
    var collector=HttpResponse.BodySubscribers.ofByteArray();
    requests.getFirst().bodyPublisher().orElseThrow().subscribe(new Flow.Subscriber<ByteBuffer>() {
      public void onSubscribe(Flow.Subscription s){collector.onSubscribe(s);}
      public void onNext(ByteBuffer value){collector.onNext(List.of(value));}
      public void onError(Throwable error){collector.onError(error);}
      public void onComplete(){collector.onComplete();}
    });
    var input=json.readTree(collector.getBody().toCompletableFuture().get()).path("input").path("messages").path(0).path("content");
    assertEquals(3,input.size());assertTrue(input.path(0).path("image").asText().startsWith("data:image/png;base64,"));
    assertTrue(input.path(2).path("text").asText().contains("双图拼贴"));
    assertTrue(input.path(2).path("text").asText().startsWith(template.prompt));
    assertNotNull(ImageIO.read(dir.resolve("out.png").toFile()));
  }
  @Test void authenticationErrorIsNotReplacedWithSimulationOrRawError() throws Exception {
    when(client.sendAsync(any(),org.mockito.ArgumentMatchers.<HttpResponse.BodyHandler<byte[]>>any())).thenAnswer(i -> CompletableFuture.completedFuture(response(401,"sensitive provider error".getBytes())));
    var failure=assertThrows(ImageGenerator.Failure.class,()->generator("test-secret").generate(task,template,List.of(),dir.resolve("out.png")));
    assertEquals("BAILIAN_AUTH_FAILED",failure.code);assertFalse(failure.getMessage().contains("sensitive"));assertFalse(Files.exists(dir.resolve("out.png")));
  }
  @Test void rejectsPrivateDownloadDestination() throws Exception {
    when(client.sendAsync(any(),org.mockito.ArgumentMatchers.<HttpResponse.BodyHandler<byte[]>>any())).thenAnswer(i -> CompletableFuture.completedFuture(response(200,result("http://127.0.0.1/private"))));
    var failure=assertThrows(ImageGenerator.Failure.class,()->generator("test-secret").generate(task,template,List.of(),dir.resolve("out.png")));
    assertEquals("BAILIAN_BAD_IMAGE_URL",failure.code);verify(client,times(1)).sendAsync(any(),any());
  }
  @Test void rejectsNonOfficialApiBase() {
    assertThrows(IllegalArgumentException.class,()->new ImageGenerator(media,json,"secret","model","https://example.org/api/v1",client));
  }
  @Test void boundsResponseBodyAndCancelsOversizedStream() {
    var body=new ImageGenerator.LimitedBody(3);var subscription=mock(Flow.Subscription.class);body.onSubscribe(subscription);
    body.onNext(List.of(ByteBuffer.wrap(new byte[4])));verify(subscription).cancel();assertTrue(body.future.isCompletedExceptionally());
  }
}
