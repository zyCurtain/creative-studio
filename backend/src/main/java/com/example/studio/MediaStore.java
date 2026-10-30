package com.example.studio;

import com.example.studio.Models.*;
import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.*;
import java.nio.file.*;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@Service
public class MediaStore {

  private final Path root;

  public MediaStore(@Value("${studio.storage}") String dir) throws IOException {
    root = Path.of(dir).toAbsolutePath().normalize();
    Files.createDirectories(root);
  }

  public Path path(String key) {
    Path p = root.resolve(key).normalize();
    if (!p.startsWith(root)) throw new IllegalArgumentException(
      "Invalid media path"
    );
    return p;
  }

  public Asset upload(String owner, MultipartFile file) throws IOException {
    if (
      file.isEmpty() || file.getSize() > 5242880
    ) throw new ResponseStatusException(
      HttpStatus.PAYLOAD_TOO_LARGE,
      "请选择不超过 5 MiB 的图片"
    );
    String mime;
    try (var input = ImageIO.createImageInputStream(file.getInputStream())) {
      var readers = ImageIO.getImageReaders(input);
      if (!readers.hasNext()) throw new ResponseStatusException(
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        "文件不是可读取的图片"
      );
      var reader = readers.next();
      try {
        reader.setInput(input);
        String format = reader.getFormatName().toLowerCase();
        if (
          !format.equals("png") && !format.equals("jpeg")
        ) throw new ResponseStatusException(
          HttpStatus.UNSUPPORTED_MEDIA_TYPE,
          "仅支持 JPEG 和 PNG"
        );
        if (
          (long) reader.getWidth(0) * reader.getHeight(0) > 25000000
        ) throw new ResponseStatusException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          "图片像素不得超过 2500 万"
        );
        reader.read(0);
        mime = format.equals("png") ? "image/png" : "image/jpeg";
      } finally {
        reader.dispose();
      }
    } catch (IOException e) {
      throw new ResponseStatusException(
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        "图片文件已损坏，请重新选择",
        e
      );
    }
    Asset a = new Asset();
    a.id = UUID.randomUUID().toString();
    a.ownerId = owner;
    a.mimeType = mime;
    a.sizeBytes = file.getSize();
    String name = file.getOriginalFilename();
    a.originalName = name == null
      ? "image"
      : name.substring(0, Math.min(name.length(), 255));
    a.storageKey =
      "upload-" + a.id + (mime.equals("image/png") ? ".png" : ".jpg");
    try (InputStream in = file.getInputStream()) {
      Files.copy(in, path(a.storageKey));
    } catch (IOException e) {
      Files.deleteIfExists(path(a.storageKey));
      throw e;
    }
    return a;
  }

  // Original, procedural artwork: no external image service or copyrighted source assets.
  public synchronized Path cover(Template t) throws IOException {
    Path target = path("cover-" + t.id + ".png");
    if (Files.exists(target)) return target;
    BufferedImage img = new BufferedImage(720, 960, BufferedImage.TYPE_INT_RGB);
    Graphics2D g = img.createGraphics();
    g.setRenderingHint(
      RenderingHints.KEY_ANTIALIASING,
      RenderingHints.VALUE_ANTIALIAS_ON
    );
    Color base = switch (t.palette) {
      case "blue" -> new Color(48, 86, 142);
      case "orange" -> new Color(190, 104, 58);
      case "pink" -> new Color(170, 95, 126);
      case "purple" -> new Color(107, 89, 151);
      case "lime" -> new Color(117, 139, 77);
      default -> new Color(43, 109, 108);
    };
    g.setPaint(
      new GradientPaint(0, 0, base.brighter(), 720, 960, base.darker().darker())
    );
    g.fillRect(0, 0, 720, 960);
    g.setColor(new Color(255, 237, 194));
    g.fillOval(410, 95, 190, 190);
    if (t.category.equals("宠物日记")) {
      g.setColor(new Color(241, 213, 173));
      g.fillOval(145, 300, 430, 420);
      g.fillPolygon(
        new int[] { 150, 180, 300 },
        new int[] { 430, 195, 350 },
        3
      );
      g.fillPolygon(
        new int[] { 420, 550, 570 },
        new int[] { 350, 195, 430 },
        3
      );
      g.setColor(new Color(50, 44, 48));
      g.fillOval(260, 460, 22, 35);
      g.fillOval(438, 460, 22, 35);
      g.fillOval(335, 530, 50, 30);
      g.setStroke(new BasicStroke(4));
      g.drawArc(315, 545, 45, 40, 180, 180);
      g.drawArc(360, 545, 45, 40, 180, 180);
    } else {
      g.setColor(new Color(239, 214, 173));
      g.fillPolygon(
        new int[] { -70, 220, 410, 720, 790 },
        new int[] { 720, 290, 590, 370, 960 },
        5
      );
      g.setColor(base.darker());
      g.fillPolygon(
        new int[] { -30, 270, 480, 760, 760 },
        new int[] { 850, 520, 760, 540, 960 },
        5
      );
      g.setColor(new Color(255, 255, 255, 40));
      g.fillRect(65, 70, 250, 5);
      g.fillRect(65, 85, 160, 3);
    }
    g.setColor(new Color(255, 255, 255, 200));
    g.setFont(new Font("SansSerif", Font.PLAIN, 19));
    g.drawString("STUDIO / ORIGINAL COLLECTION", 55, 875);
    g.setFont(new Font("SansSerif", Font.BOLD, 42));
    g.drawString(t.palette.toUpperCase() + " DAYS", 55, 835);
    g.dispose();
    ImageIO.write(img, "png", target.toFile());
    return target;
  }
}
