import Button from './Button';

interface RecoveryBannerProps {
  onKeep: () => void;
  onDiscard: () => void;
}

// SPEC section 11: non-blocking recovery banner.
export function RecoveryBanner({ onKeep, onDiscard }: RecoveryBannerProps) {
  return (
    <div className="banner recovery">
      <span className="banner-messages">Recovered unsaved work.</span>
      <Button size="sm" onClick={onKeep}>
        Keep
      </Button>
      <Button size="sm" onClick={onDiscard}>
        Discard
      </Button>
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
      <Button size="sm" onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  );
}
