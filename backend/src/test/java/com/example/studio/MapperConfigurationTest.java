package com.example.studio;

import static org.junit.jupiter.api.Assertions.*;

import org.apache.ibatis.session.Configuration;
import org.junit.jupiter.api.Test;

class MapperConfigurationTest {

  @Test
  void applicationMappersRegisterWithoutStatementConflicts() {
    Configuration configuration = new Configuration();
    assertDoesNotThrow(() -> {
      configuration.addMapper(StudioMapper.class);
      configuration.addMapper(AccountMapper.class);
    });
  }
}
