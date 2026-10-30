ALTER TABLE template
  ADD COLUMN owner_id VARCHAR(36) NULL,
  ADD COLUMN cover_asset_id VARCHAR(36) NULL,
  ADD COLUMN prompt VARCHAR(1000) NULL,
  ADD COLUMN created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD CONSTRAINT fk_template_owner FOREIGN KEY(owner_id) REFERENCES studio_owner(id),
  ADD CONSTRAINT fk_template_cover FOREIGN KEY(cover_asset_id) REFERENCES asset(id),
  ADD INDEX idx_template_owner(owner_id);

UPDATE template SET prompt = CASE id
  WHEN 'travel-postcard' THEN '将参考照片制作成旅行明信片，保留真实景物特色，温暖自然色调，留白与精致纸感边框。'
  WHEN 'city-poster' THEN '将参考照片制作成现代城市旅行海报，保留建筑特征，突出街道光影与几何构图。'
  WHEN 'pet-cover' THEN '以参考照片中的宠物为唯一主角制作杂志封面，保持毛色、面部特征和品种，温暖活泼。'
  WHEN 'pet-card' THEN '结合两张参考图制作宠物陪伴纪念卡，保留各图主体特征，采用协调的双图布局。'
  WHEN 'duo-collage' THEN '将两张参考照片制作成创意双图拼贴，各图主体都必须保留，统一色调并保持层次。'
  WHEN 'travel-pair' THEN '将两张旅行参考照片制作成双联旅行海报，两处风景均清晰可见，构图和配色统一。'
  ELSE prompt END WHERE owner_id IS NULL;
