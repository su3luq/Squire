'use client';

import { useState, useTransition } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ServerActionResult = { error?: string | null } | void;

interface ConfirmButtonProps {
  /** Visible label of the trigger button. */
  label: string;
  /** Label while the action is in flight. */
  pendingLabel?: string;
  /** Modal title. */
  title: string;
  /** Modal body. */
  description: React.ReactNode;
  /** Server action invoked on confirm. Return { error } to display an inline error. */
  action: () => Promise<ServerActionResult>;
  /** Called after a successful action. Use to router.refresh() / router.push(). */
  onSuccess?: () => void | Promise<void>;
  /** Button variant for the trigger. Defaults to "destructive". */
  variant?: 'destructive' | 'outline' | 'default' | 'secondary' | 'ghost';
  /** Disable the trigger entirely. */
  disabled?: boolean;
  /** Helper text rendered below the trigger (e.g. "stops new accepts"). */
  helperText?: React.ReactNode;
  /** Confirm-button label inside the dialog. Defaults to "label". */
  confirmLabel?: string;
  className?: string;
  triggerClassName?: string;
}

/**
 * Standard destructive-action confirm flow. Replaces the hand-rolled
 * useState+useTransition+AlertDialog boilerplate copy-pasted across the
 * teacher delete/disband/archive buttons.
 *
 * Usage:
 *   <ConfirmButton
 *     label="Delete quest"
 *     title="Delete this quest?"
 *     description="Permanently removes …"
 *     action={() => deleteQuest(questId)}
 *     onSuccess={() => { router.push('/teacher/quests'); router.refresh(); }}
 *   />
 */
export function ConfirmButton({
  label,
  pendingLabel,
  title,
  description,
  action,
  onSuccess,
  variant = 'destructive',
  disabled = false,
  helperText,
  confirmLabel,
  className,
  triggerClassName,
}: ConfirmButtonProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result && 'error' in result && result.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      await onSuccess?.();
    });
  }

  const inFlightLabel = pendingLabel ?? `${label}…`;

  return (
    <div className={cn('space-y-2', className)}>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger
          className={cn(
            buttonVariants({ variant }),
            triggerClassName,
          )}
          disabled={disabled || isPending}
        >
          {isPending ? inFlightLabel : label}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              disabled={isPending}
              className={cn(
                variant === 'destructive' &&
                  'bg-destructive text-destructive-foreground hover:bg-destructive/90',
              )}
            >
              {isPending ? inFlightLabel : confirmLabel ?? label}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {helperText && !error && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
}
