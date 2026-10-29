import config from 'virtual:open-slide/config';
import { Link } from 'react-router-dom';
import { buttonVariants } from '@/components/ui/button';
import { useLocale } from '@/lib/use-locale';
import { LemonEmpty } from '../feedback/lemon-empty';
import { useLrText } from '../text';

export function NotFound() {
  const t = useLocale();
  const lr = useLrText();
  return (
    <div className="grid min-h-dvh place-items-center bg-background px-6 text-foreground">
      <LemonEmpty
        state="thinking"
        title={t.notFound.title}
        actions={
          config.build.showSlideBrowser && (
            <Link
              to="/"
              className={buttonVariants({ variant: 'outline' })}
              data-slot="button"
              data-variant="outline"
            >
              {lr.feedback.backHome}
            </Link>
          )
        }
      >
        <p className="folio mb-1">{t.notFound.eyebrow}</p>
        {lr.feedback.notFoundHint}
      </LemonEmpty>
    </div>
  );
}
