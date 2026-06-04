import { getFile } from '../src/figma-client.js';

const [, , fileKey] = process.argv;
if (!fileKey) {
  console.error('Usage: validate-file.ts <fileKey>');
  process.exit(1);
}

const token = process.env.FIGMA_TOKEN;
if (!token) {
  console.error('FIGMA_TOKEN not set');
  process.exit(1);
}

const file = await getFile({ fileKey, token });
console.log(JSON.stringify(file));
