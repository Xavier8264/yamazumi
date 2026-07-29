interface RecoveryBannerProps {
  onKeep: () => void;
  onDiscard: () => void;
}

// SPEC section 11: non-blocking recovery banner.
export function RecoveryBanner({ onKeep, onDiscard }: RecoveryBannerProps) {
  return (
    <div className="banner recovery">
      <span>Recovered unsaved work.</span>
      <button onClick={onKeep}>Keep</button>
      <button onClick={onDiscard}>Discard</button>
    </div>
  );
}

export interface Notice {
  kind: 'warning' | 'error';
  messages: string[];
}

interface NoticeBarProps {
  notice: Notice;
  onDismiss: () => void;
}

export function NoticeBar({ notice, onDismiss }: NoticeBarProps) {
  return (
    <div className={'banner ' + notice.kind}>
      <div className="banner-messages">
        {notice.messages.map((m, i) => (
          <div key={i}>{m}</div>
        ))}
      </div>
      <button onClick={onDismiss}>Dismiss</button>
    </div>
  );
}
