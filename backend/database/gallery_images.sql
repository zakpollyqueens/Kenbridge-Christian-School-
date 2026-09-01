CREATE TABLE IF NOT EXISTS gallery_images(
id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
title VARCHAR(200) NOT NULL,
description TEXT,
image_url TEXT NOT NULL,
storage_path TEXT,
category VARCHAR(100) DEFAULT 'School Life',
uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
is_published BOOLEAN NOT NULL DEFAULT true,
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS gallery_images_published_idx
ON gallery_images(is_published,created_at DESC);

CREATE INDEX IF NOT EXISTS gallery_images_category_idx
ON gallery_images(category);

CREATE OR REPLACE FUNCTION update_gallery_images_updated_at()
RETURNS TRIGGER AS $$
BEGIN
NEW.updated_at=NOW();
RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS gallery_images_updated_at_trigger ON gallery_images;

CREATE TRIGGER gallery_images_updated_at_trigger
BEFORE UPDATE ON gallery_images
FOR EACH ROW
EXECUTE FUNCTION update_gallery_images_updated_at();
