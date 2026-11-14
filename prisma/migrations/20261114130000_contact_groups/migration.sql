-- 亲友分组：从自由文本改为受控枚举 key
-- 旧值按语义映射，未知值归到 OTHER；已是新 key 的行不动（幂等）
UPDATE "contact"
SET "relation_tag" = CASE "relation_tag"
    WHEN '亲戚' THEN 'FATHER_SIDE'
    WHEN '同事' THEN 'COLLEAGUE'
    WHEN '同学' THEN 'COLLEGE'
    WHEN '朋友' THEN 'FRIEND'
    ELSE 'OTHER'
END
WHERE "relation_tag" IS NOT NULL
  AND "relation_tag" NOT IN (
    'FATHER_SIDE',
    'MOTHER_SIDE',
    'PRIMARY_SCHOOL',
    'JUNIOR_SCHOOL',
    'HIGH_SCHOOL',
    'COLLEGE',
    'COLLEAGUE',
    'FRIEND',
    'OTHER'
  );
