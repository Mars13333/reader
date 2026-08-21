import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';

const countCharacters = (text) => String(text ?? '').replace(/\s/gu, '').length;
const FIXED_TOPIC_TAGS = '#保持阅读 #书籍分享 #个人成长 #认知提升';

const validatePublishMaterials = (value) => {
  const errors = [];
  const title = typeof value?.title === 'string' ? value.title.trim() : '';
  const descriptionLines = Array.isArray(value?.descriptionLines)
    ? value.descriptionLines.map((line) => (typeof line === 'string' ? line.trim() : ''))
    : [];

  if (!title) {
    errors.push('发布标题不能为空。');
  } else if (countCharacters(title) < 6 || countCharacters(title) > 30) {
    errors.push('发布标题应简洁吸睛，控制在 6～30 个非空白字符。');
  }
  if (descriptionLines.length < 1 || descriptionLines.length > 2) {
    errors.push('作品简介必须正好填写 1～2 句。');
  }
  for (const [index, line] of descriptionLines.entries()) {
    const length = countCharacters(line);
    if (!line) errors.push(`作品简介第 ${index + 1} 句不能为空。`);
    else if (length < 8 || length > 80) {
      errors.push(`作品简介第 ${index + 1} 句应控制在 8～80 个非空白字符。`);
    }
  }

  return {errors, materials: {title, descriptionLines}};
};

const readPublishMaterials = (context) => {
  const publishPath = path.join(context.contentDir, 'publish.json');
  if (!existsSync(publishPath)) {
    return {
      errors: [`缺少发布物料配置：${publishPath}`],
      materials: {title: '', descriptionLines: []},
      publishPath,
    };
  }
  try {
    const value = JSON.parse(readFileSync(publishPath, 'utf8'));
    return {...validatePublishMaterials(value), publishPath};
  } catch (error) {
    return {
      errors: [`发布物料配置不是有效 JSON：${error instanceof Error ? error.message : String(error)}`],
      materials: {title: '', descriptionLines: []},
      publishPath,
    };
  }
};

const formatPublishCopy = ({title, descriptionLines}) =>
  [
    '标题：',
    title,
    '',
    '作品简介：',
    ...descriptionLines,
    '',
    '话题标签：',
    FIXED_TOPIC_TAGS,
    '',
  ].join('\n');

export {FIXED_TOPIC_TAGS, formatPublishCopy, readPublishMaterials, validatePublishMaterials};
