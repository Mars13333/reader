import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';

const STORYBOARD_STANDARD = 'portrait-2x2-9x16-v1';
const STORYBOARD_ASPECT_RATIO = 9 / 16;
const STORYBOARD_ASPECT_TOLERANCE = 0.005;
const STORYBOARD_CANVAS_ASPECT = '9:16';
const STORYBOARD_PANEL_ORDER = [
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
];
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const readPngDimensions = (filePath) => {
  const header = readFileSync(filePath).subarray(0, 24);
  if (
    header.length < 24 ||
    !header.subarray(0, 8).equals(PNG_SIGNATURE) ||
    header.toString('ascii', 12, 16) !== 'IHDR'
  ) {
    throw new Error('不是有效的 PNG 图片');
  }
  const width = header.readUInt32BE(16);
  const height = header.readUInt32BE(20);
  if (width === 0 || height === 0) throw new Error('PNG 宽高无效');
  return {width, height};
};

const validateStoryboardDimensions = ({width, height}) => {
  const ratio = width / height;
  const relativeError = Math.abs(ratio - STORYBOARD_ASPECT_RATIO) / STORYBOARD_ASPECT_RATIO;
  if (height <= width || relativeError > STORYBOARD_ASPECT_TOLERANCE) {
    return [
      `尺寸 ${width}x${height} 不符合纵向 9:16 母图标准（允许像素取整误差 ≤0.5%）`,
    ];
  }
  return [];
};

const inspectStoryboardStandard = ({book, visualPlan, publicDir}) => {
  const configuredStandard = book.editorialStandards?.storyboardStandard;
  if (!configuredStandard) {
    return {enabled: false, standard: '', assets: [], errors: []};
  }

  const errors = [];
  if (configuredStandard !== STORYBOARD_STANDARD) {
    errors.push(`不支持的分镜标准：${configuredStandard}`);
  }
  if (visualPlan.storyboardStandard !== STORYBOARD_STANDARD) {
    errors.push(`visual-plan.json.storyboardStandard 必须为 ${STORYBOARD_STANDARD}。`);
  }
  if (visualPlan.canvasAspectRatio !== STORYBOARD_CANVAS_ASPECT) {
    errors.push('visual-plan.json.canvasAspectRatio 必须为 9:16。');
  }
  if (visualPlan.panelLayout !== '2x2') {
    errors.push('visual-plan.json.panelLayout 必须为 2x2。');
  }
  if (JSON.stringify(visualPlan.panelOrder) !== JSON.stringify(STORYBOARD_PANEL_ORDER)) {
    errors.push('visual-plan.json.panelOrder 必须按左上、右上、左下、右下排列。');
  }

  const imageReferences = [
    ...new Set(
      (visualPlan.segments ?? [])
        .map((segment) => segment.image)
        .filter((image) => typeof image === 'string' && image.trim()),
    ),
  ];
  if (imageReferences.length === 0) {
    errors.push('visual-plan.json 尚未引用任何分镜母图。');
  }

  const assets = [];
  for (const image of imageReferences) {
    const imagePath = path.join(publicDir, image);
    if (!existsSync(imagePath)) {
      errors.push(`缺少分镜母图：${imagePath}`);
      continue;
    }
    try {
      const dimensions = readPngDimensions(imagePath);
      assets.push({image, ...dimensions});
      for (const error of validateStoryboardDimensions(dimensions)) {
        errors.push(`${image}：${error}。`);
      }
    } catch (error) {
      errors.push(`${image}：${error.message}。分镜母图必须保存为 PNG。`);
    }
  }

  return {
    enabled: true,
    standard: configuredStandard,
    assets,
    errors,
  };
};

export {
  STORYBOARD_ASPECT_TOLERANCE,
  STORYBOARD_CANVAS_ASPECT,
  STORYBOARD_PANEL_ORDER,
  STORYBOARD_STANDARD,
  inspectStoryboardStandard,
  readPngDimensions,
  validateStoryboardDimensions,
};
