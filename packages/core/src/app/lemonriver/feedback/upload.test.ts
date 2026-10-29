import { describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

import { toast } from 'sonner';
import { ASSET_MAX_BYTES } from '../../../files/assets';
import { en } from '../../../locale/en';
import { toastUploadFailed, UPLOAD_LIMIT_BYTES } from './upload';

describe('toastUploadFailed', () => {
  it('uses the same limit as the server', () => {
    expect(UPLOAD_LIMIT_BYTES).toBe(ASSET_MAX_BYTES);
  });

  it('explains a file that is too large', () => {
    toastUploadFailed(en, 413);
    expect(toast.error).toHaveBeenLastCalledWith('The file is over 25 MB', {
      description: 'Compress the image or pick a smaller file, then upload again.',
    });
  });

  it('keeps the official message for other failures', () => {
    toastUploadFailed(en, 500);
    expect(toast.error).toHaveBeenLastCalledWith('Upload failed (500)');
  });
});
