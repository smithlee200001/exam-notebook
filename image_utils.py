"""Validate uploaded images and re-encode pixels without source metadata."""
import io
import warnings

from PIL import Image, ImageOps

MAX_IMAGE_BYTES = 4 * 1024 * 1024
MAX_PIXELS = 8_000_000


def clean_image(raw):
    if not raw or len(raw) > MAX_IMAGE_BYTES:
        raise ValueError('上传图片必须小于 4 MB')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as source:
                if source.format not in ('PNG', 'JPEG', 'WEBP'):
                    raise ValueError('上传只支持 PNG/JPEG/WebP')
                if source.width * source.height > MAX_PIXELS:
                    raise ValueError('上传不能超过 800 万像素')
                if source.width < 5 or source.height < 5:
                    raise ValueError('上传太小')
                # Re-encode pixels, never retain EXIF, text metadata or source bytes.
                image = ImageOps.exif_transpose(source).convert('RGB')
                image.info.clear()
                out = io.BytesIO()
                image.save(out, format='PNG')
                return out.getvalue()
    except (OSError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise ValueError('上传图片无效或过大') from None

