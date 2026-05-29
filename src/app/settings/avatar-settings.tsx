'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/ui/button';
import { uploadAvatar } from '@/lib/avatar-upload';
import { clearAvatar } from './actions';

interface Props {
  fullName: string;
  avatarUrl: string | null;
  currentRank?: number | null;
}

export function AvatarSettings({
  fullName,
  avatarUrl,
  currentRank,
}: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isClearing, startClear] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(avatarUrl);

  async function handleFile(file: File) {
    setError(null);
    setIsUploading(true);
    try {
      const { publicUrl } = await uploadAvatar(file);
      setPreviewUrl(publicUrl);
      toast.success('Profile picture updated');
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed.';
      setError(message);
      toast.error(message);
    } finally {
      setIsUploading(false);
    }
  }

  function handleClear() {
    setError(null);
    startClear(async () => {
      const r = await clearAvatar();
      if (r.error) {
        setError(r.error);
        toast.error(r.error);
        return;
      }
      setPreviewUrl(null);
      toast.success('Profile picture removed');
      router.refresh();
    });
  }

  const busy = isUploading || isClearing;

  return (
    <div className="flex items-center gap-5">
      <Avatar url={previewUrl} name={fullName} size="lg" rank={currentRank} />
      <div className="space-y-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = '';
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            {isUploading
              ? 'Uploading…'
              : previewUrl
                ? 'Change photo'
                : 'Upload photo'}
          </Button>
          {previewUrl && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleClear}
              disabled={busy}
            >
              {isClearing ? 'Removing…' : 'Remove'}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          JPEG, PNG, or WebP. Max 5 MB — we resize it to 256×256 WebP.
        </p>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </div>
  );
}
