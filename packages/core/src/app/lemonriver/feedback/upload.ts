import { toast } from 'sonner';
import { format } from '../../../locale/format';
import type { Locale } from '../../../locale/types';
import { lrTextFor } from '../text/all';

/** The dev server's upload limit. upload.test.ts keeps it equal to the server's. */
export const UPLOAD_LIMIT_BYTES = 25 * 1024 * 1024;

/** The failed-upload toast; a file over the size limit says so and what to do about it. */
export function toastUploadFailed(t: Locale, status: number): void {
  if (status === 413) {
    const lr = lrTextFor(t.id).feedback;
    toast.error(format(lr.uploadTooLarge, { limit: UPLOAD_LIMIT_BYTES / 1024 / 1024 }), {
      description: lr.uploadTooLargeHint,
    });
    return;
  }
  toast.error(format(t.asset.toastUploadFailed, { status }));
}
