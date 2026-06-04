import { getMe } from '../src/figma-client.js';

const token = process.env.FIGMA_TOKEN;
if (!token) {
  console.error('FIGMA_TOKEN not set');
  process.exit(1);
}

const me = await getMe({ token });
console.log(JSON.stringify(me));
