import { useEffect, useState } from 'react';
import { Download, WifiOff } from 'lucide-react';

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaControls() {
  const [online, setOnline] = useState(navigator.onLine);
  const [install, setInstall] = useState<InstallPrompt | null>(null);
  const [installing, setInstalling] = useState(false);
  useEffect(() => {
    const connected = () => setOnline(true);
    const disconnected = () => setOnline(false);
    const available = (event: Event) => { event.preventDefault(); setInstall(event as InstallPrompt); };
    const installed = () => setInstall(null);
    window.addEventListener('online', connected);
    window.addEventListener('offline', disconnected);
    window.addEventListener('beforeinstallprompt', available);
    window.addEventListener('appinstalled', installed);
    return () => {
      window.removeEventListener('online', connected);
      window.removeEventListener('offline', disconnected);
      window.removeEventListener('beforeinstallprompt', available);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);
  async function installApp() {
    if (!install || installing) return;
    setInstalling(true);
    try { await install.prompt(); await install.userChoice; }
    finally { setInstall(null); setInstalling(false); }
  }
  return <>
    {!online && <p role="status" className="flex items-center gap-2 rounded-lg bg-amber-400/10 px-3 py-2 text-xs text-amber-300"><WifiOff className="size-4 shrink-0" />Sin conexión · Los datos pueden estar desactualizados.</p>}
    {install && <button type="button" disabled={installing} onClick={() => void installApp().catch(() => undefined)} className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300"><Download className="size-4" />Instalar BullVest</button>}
  </>;
}
