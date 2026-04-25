import { Bell, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  enabled: boolean;
  onEnable: () => void;
}

/**
 * Small button that lets the user enable audio notifications.
 * Browsers require a user gesture before AudioContext can play sound, so
 * this control unlocks playback once and keeps the AudioContext alive.
 */
export function SoundEnabler({ enabled, onEnable }: Props) {
  if (enabled) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Bell className="h-3.5 w-3.5 text-primary" />
        <span>Sonido activo</span>
      </div>
    );
  }
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={onEnable}
      className="gap-2 border-primary/40 text-primary hover:bg-primary/10"
    >
      <BellOff className="h-4 w-4" />
      Activar sonido
    </Button>
  );
}
