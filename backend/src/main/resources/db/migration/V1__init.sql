CREATE TABLE visitor_session (
  id VARCHAR(36) PRIMARY KEY,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE template (
  id VARCHAR(40) PRIMARY KEY, title VARCHAR(80) NOT NULL, category VARCHAR(40) NOT NULL,
  description VARCHAR(400) NOT NULL, required_image_count INT NOT NULL, palette VARCHAR(20) NOT NULL,
  sort_order INT NOT NULL
);
INSERT INTO template VALUES
('travel-postcard','山野来信','旅行灵感','把旅途的片刻，装进一张值得珍藏的明信片。',1,'teal',1),
('city-poster','城市切片','旅行灵感','街角、建筑与光影，组成属于你的城市印象。',1,'blue',2),
('pet-cover','毛茸茸的主角','宠物日记','为家里的小伙伴，制作一张专属封面。',1,'orange',3),
('pet-card','陪伴纪念卡','宠物日记','两张照片，收藏你们一起长大的时光。',2,'pink',4),
('duo-collage','一起的瞬间','创意拼贴','把两个视角拼在一起，讲述同一个故事。',2,'purple',5),
('travel-pair','此刻与彼岸','创意拼贴','用两张旅行照片，留下一段关于远方的记忆。',2,'lime',6);
CREATE TABLE asset (
  id VARCHAR(36) PRIMARY KEY, owner_id VARCHAR(36) NOT NULL, original_name VARCHAR(255) NOT NULL,
  storage_key VARCHAR(150) NOT NULL, mime_type VARCHAR(30) NOT NULL, size_bytes BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES visitor_session(id), INDEX(owner_id)
);
CREATE TABLE creation_task (
  id VARCHAR(36) PRIMARY KEY, owner_id VARCHAR(36) NOT NULL, template_id VARCHAR(40) NOT NULL,
  template_title VARCHAR(80) NOT NULL, status VARCHAR(20) NOT NULL, current_stage VARCHAR(30), failed_stage VARCHAR(30),
  error_code VARCHAR(50), error_message VARCHAR(300), result_storage_key VARCHAR(150),
  fail_at VARCHAR(30) NOT NULL, delay_ms INT NOT NULL, version BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY(owner_id) REFERENCES visitor_session(id), FOREIGN KEY(template_id) REFERENCES template(id),
  INDEX(owner_id, created_at, id), INDEX(owner_id, status), INDEX(owner_id, template_id)
);
CREATE TABLE task_asset (
  task_id VARCHAR(36) NOT NULL, asset_id VARCHAR(36) NOT NULL, slot_index INT NOT NULL,
  PRIMARY KEY(task_id, slot_index), FOREIGN KEY(task_id) REFERENCES creation_task(id), FOREIGN KEY(asset_id) REFERENCES asset(id)
);
CREATE TABLE task_stage (
  task_id VARCHAR(36) NOT NULL, stage VARCHAR(30) NOT NULL, position INT NOT NULL, status VARCHAR(20) NOT NULL,
  started_at TIMESTAMP(3), finished_at TIMESTAMP(3),
  PRIMARY KEY(task_id, stage), FOREIGN KEY(task_id) REFERENCES creation_task(id)
);

