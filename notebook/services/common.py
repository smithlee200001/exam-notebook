def string(value, limit=20000):
    if not isinstance(value, str) or len(value) > limit or "\x00" in value:
        raise ValueError("文字字段无效或过长")
    return value.strip()
