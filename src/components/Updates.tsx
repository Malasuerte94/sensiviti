import { useEffect, useState } from 'react';
import { Download, RefreshCw, X } from 'lucide-react';
import type { UpdateStatus } from '../core/updates';

export function useUpdates() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [error, setError] = useState('');
  const [dismissed, setDismissed] = useState('');
  useEffect(() => {
    const api = window.sensiviti?.updates;
    if (!api) return;
    let active = true;
    const receive = (value: UpdateStatus) => {
      if (active) setStatus(value);
    };
    const unsubscribe = api.subscribe(receive);
    void api
      .status()
      .then(receive)
      .catch(() => {
        if (active) setError('Could not read update status. Restart the app to retry.');
      });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  async function check() {
    setError('');
    try {
      const value = await window.sensiviti?.updates?.check();
      if (value) setStatus(value);
    } catch {
      setError('Could not check for updates. Try again later.');
    }
  }
  async function download() {
    setError('');
    try {
      await window.sensiviti?.updates?.download();
    } catch {
      setError('Could not open the download in your browser. Try again.');
    }
  }
  return {
    status,
    error,
    check,
    download,
    dismissed,
    dismiss: () => setDismissed(status?.release?.version ?? ''),
  };
}
type Updates = ReturnType<typeof useUpdates>;

export function UpdateNotice({ updates }: { updates: Updates }) {
  const { status, dismissed, dismiss, download, error } = updates;
  if (!status?.release || status.release.version === dismissed) return null;
  return (
    <div className="update-notice" role="status">
      <Download size={18} />
      <div>
        <strong>Sensiviti {status.release.version} is available</strong>
        <span>{error || 'A new version is ready. Your saved progress stays on this device.'}</span>
      </div>
      <button className="button secondary" onClick={() => void download()}>
        Download {status.edition === 'portable' ? 'portable' : 'installer'}
      </button>
      <button className="icon-button" aria-label="Dismiss update notification" onClick={dismiss}>
        <X size={17} />
      </button>
    </div>
  );
}

export function UpdateSettings({ updates }: { updates: Updates }) {
  const { status, check, download, error } = updates;
  if (!window.sensiviti?.updates) return null;
  const message =
    status?.phase === 'checking'
      ? 'Checking for updates…'
      : status?.phase === 'error'
        ? status.message
        : status?.release
          ? `Sensiviti ${status.release.version} is available.`
          : status?.phase === 'current'
            ? 'You’re up to date.'
            : 'Checks automatically at startup and every 6 hours while the app is open.';
  return (
    <section className="panel update-panel" aria-labelledby="updates-heading">
      <div className="section-heading">
        <div>
          <h3 id="updates-heading">App updates</h3>
          <p>
            {status
              ? `Version ${status.currentVersion} · ${status.edition === 'portable' ? 'Portable' : 'Installed edition'}`
              : 'Reading update status…'}
          </p>
        </div>
        <div className="row gap12">
          <button
            className="button secondary"
            disabled={!status || status.phase === 'checking'}
            onClick={() => void check()}
          >
            <RefreshCw size={15} className={status?.phase === 'checking' ? 'spin' : ''} />
            Check for updates
          </button>
          {status?.release && (
            <button className="button primary" onClick={() => void download()}>
              <Download size={15} />
              Download {status.edition === 'portable' ? 'portable' : 'installer'}
            </button>
          )}
        </div>
      </div>
      <p role="status">{error || message}</p>
      {status?.checkedAt != null && (
        <small>Last checked: {new Date(status.checkedAt).toLocaleString()}</small>
      )}
      <p className="muted small">
        Downloads open in your browser.{' '}
        {status?.edition === 'portable'
          ? 'Close Sensiviti, then run the new portable file. You can remove the old executable afterward.'
          : 'Close Sensiviti, then run the new installer to update.'}{' '}
        Your profiles and backups are preserved.
      </p>
      <small>
        Only public release information is requested from GitHub. Your profile stays local. Offline
        use is always available. Repeated checks are limited to once a minute.
      </small>
    </section>
  );
}
