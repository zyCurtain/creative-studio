package com.example.studio;

import com.example.studio.Models.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.util.*;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

@Component
public class TemplateCovers {
  private final Map<String,CoverCredit> credits = new HashMap<>();
  public TemplateCovers(ObjectMapper json) throws IOException {
    try (var in = new ClassPathResource("template-covers/credits.json").getInputStream()) {
      for (var row : json.readTree(in)) {
        credits.put(row.path("id").asText(), new CoverCredit(row.path("title").asText(), row.path("author").asText(),
          row.path("source").asText(),row.path("license").asText(),row.path("licenseUrl").asText()));
      }
    }
  }
  public Template decorate(Template template) {
    if (template.ownerId == null) template.coverCredit = credits.get(template.id);
    return template;
  }
  public ClassPathResource resource(Template template) {
    return template.ownerId == null && credits.containsKey(template.id)
      ? new ClassPathResource("template-covers/"+template.id+".jpg") : null;
  }
}
