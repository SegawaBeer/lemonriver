import fs from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { unzipSync } from 'fflate';
import { openSlide } from './helpers.ts';

test('image PPTX export preserves image stacking order', async ({ page }, testInfo) => {
  await openSlide(page, 'alpha');

  await page.getByRole('button', { name: 'Download' }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('menuitem', { name: 'Export as image PPTX' }).click();
  const download = await downloadPromise;
  const pptxPath = testInfo.outputPath('alpha.pptx');
  await download.saveAs(pptxPath);

  const files = unzipSync(new Uint8Array(await fs.readFile(pptxPath)));
  const slideImage = files['ppt/media/image1.png'];
  expect(slideImage).toBeDefined();

  const centerPixel = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context is unavailable');
    ctx.drawImage(image, 0, 0);
    return Array.from(ctx.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data);
  }, Buffer.from(slideImage).toString('base64'));

  expect(centerPixel).toEqual([29, 78, 216, 255]);
});
