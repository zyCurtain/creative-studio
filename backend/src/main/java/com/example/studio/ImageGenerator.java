package com.example.studio;

import com.example.studio.Models.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.*;
import java.net.URI;
import java.net.http.*;
import java.nio.ByteBuffer;
import java.nio.file.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.Flow;
import javax.imageio.ImageIO;
import org.springframework.beans.factory.annotation.*;
import org.springframework.stereotype.Service;

@Service
public class ImageGenerator {
  public static class Failure extends RuntimeException {
    public final String code;
    Failure(String code, String message) { super(message); this.code = code; }
  }
  private final String key, model;
  private final URI endpoint;
  private final MediaStore media;
  private final ObjectMapper json;
  private final HttpClient client;

  @Autowired
  public ImageGenerator(MediaStore media, ObjectMapper json,
    @Value("${studio.dashscope-key}") String key,
    @Value("${studio.image-model}") String model,
    @Value("${studio.dashscope-base}") String base) {
    this(media,json,key,model,base,HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(20)).followRedirects(HttpClient.Redirect.NEVER).build());
  }
  ImageGenerator(MediaStore media, ObjectMapper json, String key, String model, String base, HttpClient client) {
    this.media=media; this.json=json; this.key=key.strip(); this.model=model.strip(); this.client=client;
    // Accept the user's existing OpenAI-compatible base but use the native image endpoint.
    String normalized=base.strip().replaceAll("/+$", "").replace("/compatible-mode/v1", "/api/v1");
    endpoint=URI.create(normalized+"/services/aigc/multimodal-generation/generation");
    if (enabled() && (!"https".equals(endpoint.getScheme()) || endpoint.getUserInfo()!=null ||
      !("dashscope.aliyuncs.com".equals(endpoint.getHost()) || "dashscope-intl.aliyuncs.com".equals(endpoint.getHost()) ||
        (endpoint.getHost()!=null && endpoint.getHost().endsWith(".maas.aliyuncs.com")))))
      throw new IllegalArgumentException("DASHSCOPE_BASE_URL 必须为百炼官方 HTTPS 地址");
  }
  public boolean enabled() { return !key.isBlank(); }
  public String model() { return model; }
  public Map<String,Object> configuration() { return Map.of("mode",enabled()?"BAILIAN":"SIMULATION","model",enabled()?model:""); }

  static String prompt(Template template) {
    String style=template.prompt != null && !template.prompt.isBlank() ? template.prompt : switch(template.id) {
      case "travel-postcard" -> "将参考照片制作成旅行明信片，保留真实景物特色，温暖自然色调，留白与精致纸感边框。";
      case "city-poster" -> "将参考照片制作成现代城市旅行海报，保留建筑特征，突出街道光影与几何构图。";
      case "pet-cover" -> "以参考照片中的宠物为唯一主角制作杂志封面，保持毛色、面部特征和品种，温暖活泼。";
      case "pet-card" -> "结合两张参考图制作宠物陪伴纪念卡，保留各图主体特征，采用协调的双图布局。";
      case "duo-collage" -> "将两张参考照片制作成创意双图拼贴，各图主体都必须保留，统一色调并保持层次。";
      case "travel-pair" -> "将两张旅行参考照片制作成双联旅行海报，两处风景均清晰可见，构图和配色统一。";
      default -> throw new IllegalArgumentException("Unknown template");
    };
    return style+" 输出一张完整的竖版3:4图片。不得使用与参考照片无关的替代主体。不要添加文字、标志或水印。";
  }

  public void generate(Task task, Template template, List<Asset> assets, Path output) throws IOException {
    if (!"BAILIAN".equals(task.generationMode)) {
      Files.copy(media.cover(template),output,StandardCopyOption.REPLACE_EXISTING); return;
    }
    if (!enabled()) throw new Failure("BAILIAN_NOT_CONFIGURED","百炼密钥未配置，无法执行此真实生成任务");
    var content=new ArrayList<Map<String,String>>();
    for (Asset asset:assets) content.add(Map.of("image","data:"+asset.mimeType+";base64,"+Base64.getEncoder().encodeToString(Files.readAllBytes(media.path(asset.storageKey)))));
    content.add(Map.of("text",prompt(template)));
    var body=Map.of("model",task.generationModel,"input",Map.of("messages",List.of(Map.of("role","user","content",content))),
      "parameters",Map.of("n",1,"size","960*1280","watermark",false,"prompt_extend",true));
    HttpRequest request=HttpRequest.newBuilder(endpoint).timeout(Duration.ofSeconds(240))
      .header("Authorization","Bearer "+key).header("Content-Type","application/json")
      .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build();
    var response=send(request,1024*1024);
    if(response.statusCode()!=200) throw providerFailure(response.statusCode());
    URI image;
    try {
      var root=json.readTree(response.body());
      String url=root.path("output").path("choices").path(0).path("message").path("content").path(0).path("image").asText();
      image=URI.create(url);
    } catch(Exception e) { throw new Failure("BAILIAN_BAD_RESPONSE","百炼未返回有效图片，请查看模型权限或稍后重试"); }
    // Never forward the credential to the image URL. Disallow redirects and non-OSS destinations.
    if(!"https".equals(image.getScheme()) || image.getHost()==null || image.getUserInfo()!=null ||
      !(image.getHost().matches("[a-zA-Z0-9-]+\\.oss[-a-zA-Z0-9]*\\.aliyuncs\\.com")))
      throw new Failure("BAILIAN_BAD_IMAGE_URL","百炼返回了不支持的图片地址");
    var downloaded=send(HttpRequest.newBuilder(image).timeout(Duration.ofSeconds(60)).GET().build(),20*1024*1024);
    if(downloaded.statusCode()!=200) throw new Failure("BAILIAN_DOWNLOAD_FAILED","生成图片下载失败，请稍后重试");
    try(var stream=ImageIO.createImageInputStream(new ByteArrayInputStream(downloaded.body()))) {
      var readers=ImageIO.getImageReaders(stream);
      if(!readers.hasNext()) throw new IOException("Invalid image");
      var reader=readers.next();
      try {
        reader.setInput(stream);
        if((long)reader.getWidth(0)*reader.getHeight(0)>25000000) throw new IOException("Image too large");
        if(!ImageIO.write(reader.read(0),"png",output.toFile())) throw new IOException("PNG encoding failed");
      } finally { reader.dispose(); }
    } catch(IOException e) { Files.deleteIfExists(output); throw new Failure("BAILIAN_INVALID_IMAGE","生成结果无法读取或保存"); }
  }
  static Failure providerFailure(int status) {
    return switch(status) {
      case 401 -> new Failure("BAILIAN_AUTH_FAILED","百炼鉴权失败，请检查 API Key 与地域");
      case 403 -> new Failure("BAILIAN_ACCESS_DENIED","百炼拒绝调用，请检查模型权限、地域或账户状态");
      case 402 -> new Failure("BAILIAN_PAYMENT_REQUIRED","百炼账户额度不足，请检查余额");
      case 429 -> new Failure("BAILIAN_RATE_LIMIT","百炼请求受限，请检查额度或稍后重试");
      case 400,404 -> new Failure("BAILIAN_INVALID_REQUEST","百炼不接受当前请求，请检查模型名称、地域及图片规格");
      default -> new Failure("BAILIAN_UNAVAILABLE","百炼服务暂不可用，请稍后重试");
    };
  }
  private HttpResponse<byte[]> send(HttpRequest request,int limit) {
    CompletableFuture<HttpResponse<byte[]>> pending = null;
    try {
      pending = client.sendAsync(request, info -> new LimitedBody(limit));
      return pending.get(request.timeout().orElse(Duration.ofSeconds(60)).toSeconds()+5,TimeUnit.SECONDS);
    } catch(InterruptedException e) { if(pending!=null) pending.cancel(true); Thread.currentThread().interrupt(); throw new Failure("GENERATION_INTERRUPTED","图片生成已中断"); }
      catch(Exception e) { if(pending!=null) pending.cancel(true); throw new Failure("BAILIAN_NETWORK_ERROR","百炼请求超时、连接失败或响应过大；请先检查账户调用记录再重试"); }
  }
  static class LimitedBody implements HttpResponse.BodySubscriber<byte[]> {
    final int limit; final ByteArrayOutputStream bytes=new ByteArrayOutputStream();
    final CompletableFuture<byte[]> future=new CompletableFuture<>(); Flow.Subscription subscription;
    LimitedBody(int limit){this.limit=limit;}
    public CompletionStage<byte[]> getBody(){return future;}
    public void onSubscribe(Flow.Subscription s){subscription=s;s.request(1);}
    public void onNext(List<ByteBuffer> buffers){
      for(ByteBuffer buffer:buffers){
        if((long)bytes.size()+buffer.remaining()>limit){subscription.cancel();future.completeExceptionally(new IOException("Response too large"));return;}
        byte[] data=new byte[buffer.remaining()];buffer.get(data);bytes.writeBytes(data);
      }
      subscription.request(1);
    }
    public void onError(Throwable error){future.completeExceptionally(error);}
    public void onComplete(){future.complete(bytes.toByteArray());}
  }
}
