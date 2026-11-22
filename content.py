"""New Block tree validation; no legacy conversion or migration."""
import copy
import json
import math
from pathlib import Path
from jsonschema import Draft202012Validator
from geometry import validate_geometry

SCHEMA = json.loads(Path(__file__).with_name('blocks.schema.json').read_text())
VALIDATOR = Draft202012Validator(SCHEMA)
VISUAL = {'image', 'geometry', 'chart', 'table'}


def walk(blocks):
    for block in blocks:
        yield block
        yield from walk(block.get('children', []))


def validate(question):
    q = copy.deepcopy(question)
    if not isinstance(q, dict):
        raise ValueError('题目必须是对象')
    # Optional geometry collections are defaults of that type, not legacy aliases.
    def defaults(blocks):
        if not isinstance(blocks, list):
            return
        for b in blocks:
            if not isinstance(b, dict):
                continue
            if b.get('type') == 'geometry':
                for key in ('segments', 'circles', 'polygons', 'labels', 'rightAngles', 'givens'):
                    b.setdefault(key, [])
            defaults(b.get('children'))
    defaults(q.get('blocks'))
    error = next(VALIDATOR.iter_errors(q), None)
    if error:
        # oneOf reports the whole block; choose errors from its actual type branch.
        def detail(e):
            if e.validator == 'oneOf' and isinstance(e.instance, dict) and e.instance.get('type') in SCHEMA['$defs']:
                validator = Draft202012Validator({'$ref':'#/$defs/'+e.instance['type'], '$defs':SCHEMA['$defs']})
                specific = next(validator.iter_errors(e.instance), None)
                if specific:
                    return specific.message
            return e.message
        path = '.'.join(map(str, error.absolute_path)) or 'question'
        raise ValueError(f'{path}: {detail(error)[:350]}')
    if not q['blocks']:
        raise ValueError('blocks: 题目内容不能为空')
    seen = set()
    for b in walk(q['blocks']):
        if b['id'] in seen:
            raise ValueError(f"{b['id']}: 内容 ID 重复")
        seen.add(b['id'])
        t = b['type']
        if t in ('options', 'subquestions', 'table') and any(child['type'] == t for child in walk(b.get('children', []))):
            raise ValueError(f"{b['id']}: 首版不支持嵌套同类分组")
        if t in ('option', 'subquestion', 'cell') and 'children' in b and not b['children']:
            raise ValueError(f"{b['id']}: 组合内容不能为空")
        if t in ('options', 'subquestions', 'table', 'row') and not b['children']:
            raise ValueError(f"{b['id']}: 分组不能为空")
        if t == 'text' and not b['text'].strip():
            raise ValueError(f"{b['id']}: 文字不能为空")
        if t == 'options':
            b.setdefault('display', {}).setdefault('columns', 1)
            if len(b['children']) < 2:
                raise ValueError(f"{b['id']}: 至少需要两个选项")
        if t == 'blank':
            b.setdefault('display', {}).setdefault('widthEm', 5)
        if t == 'icon':
            b.setdefault('display', {}).setdefault('sizeEm', 1)
        if t in VISUAL:
            d = b.setdefault('display', {})
            d.setdefault('align', 'center')
            d.setdefault('widthPercent', 100 if t == 'table' else 60)
        if t == 'table' and len({len(row['children']) for row in b['children']}) != 1:
            raise ValueError(f"{b['id']}: 各行单元格数量必须一致")
        if t == 'geometry':
            normalized = validate_geometry(b)
            b.clear()
            b.update(normalized)
        if t == 'chart':
            if not b['categories'] or not b['series']:
                raise ValueError(f"{b['id']}: 图表需要分类和数据")
            if len({s['id'] for s in b['series']}) != len(b['series']):
                raise ValueError(f"{b['id']}: 图表系列 ID 重复")
            values = []
            for series in b['series']:
                if len(series['values']) != len(b['categories']):
                    raise ValueError(f"{b['id']}: 数值数量必须与分类数量一致")
                values.extend(series['values'])
            minimum = b['yAxis'].get('min')
            if minimum is not None and (minimum > min(values) or (t == 'chart' and b['chartType'] == 'bar' and minimum > 0)):
                raise ValueError(f"{b['id']}: 纵轴下界不能截断数据或柱状图零基线")
    def finite(value):
        if isinstance(value, float) and not math.isfinite(value):
            raise ValueError('数值必须有限')
        if isinstance(value, dict):
            for v in value.values(): finite(v)
        if isinstance(value, list):
            for v in value: finite(v)
    finite(q)
    return q
