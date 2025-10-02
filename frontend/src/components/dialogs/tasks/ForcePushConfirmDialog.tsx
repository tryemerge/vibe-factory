import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import NiceModal, { useModal } from '@ebay/nice-modal-react';
import { AlertTriangle } from 'lucide-react';

export interface ForcePushConfirmDialogProps {
  isPushing?: boolean;
}

export type ForcePushConfirmDialogResult = {
  action: 'confirmed' | 'canceled';
};

export const ForcePushConfirmDialog = NiceModal.create<ForcePushConfirmDialogProps>(
  ({ isPushing = false }) => {
    const modal = useModal();
    const { t } = useTranslation(['tasks', 'common']);

    const handleConfirm = () => {
      modal.resolve({
        action: 'confirmed',
      } as ForcePushConfirmDialogResult);
      modal.hide();
    };

    const handleCancel = () => {
      modal.resolve({ action: 'canceled' } as ForcePushConfirmDialogResult);
      modal.hide();
    };

    const handleOpenChange = (open: boolean) => {
      if (!open) {
        handleCancel();
      }
    };

    return (
      <Dialog open={modal.visible} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              {t('git.forcePush.dialog.title')}
            </DialogTitle>
            <DialogDescription>
              {t('git.forcePush.dialog.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md bg-warning/10 p-4 text-sm">
              <p className="font-medium text-warning">
                {t('git.forcePush.dialog.warning')}
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-muted-foreground">
                <li>{t('git.forcePush.dialog.warningPoint1')}</li>
                <li>{t('git.forcePush.dialog.warningPoint2')}</li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isPushing}
            >
              {t('common:buttons.cancel')}
            </Button>
            <Button
              onClick={handleConfirm}
              disabled={isPushing}
              variant="destructive"
            >
              {isPushing
                ? t('git.forcePush.dialog.pushing')
                : t('git.forcePush.dialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);
