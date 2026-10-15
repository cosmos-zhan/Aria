import { useEffect, useRef, type ReactNode } from 'react';
import { X, ArrowUpRight, Plus } from 'lucide-react';
import {
  labels,
  formatDate,
  eventLabels,
  kindLabels,
  type Entity,
  type EngineeringEvent,
  type Selection,
} from '../types';
export function Badge({ status }: { status: string }) {
  return (
    <span className={`badge badge-${status}`}>
      <i />
      {labels[status] || status}
    </span>
  );
}
export function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-symbol">◇</div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.querySelector<HTMLElement>('input,textarea,select,button')?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && ref.current) {
        const elements = Array.from(
          ref.current.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
          ),
        );
        const first = elements[0],
          last = elements[elements.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`modal ${wide ? 'modal-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-button" aria-label="关闭" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
export function AddButton({
  children,
  onClick,
  secondary = false,
}: {
  children: ReactNode;
  onClick: () => void;
  secondary?: boolean;
}) {
  return (
    <button className={secondary ? 'button secondary' : 'button'} onClick={onClick}>
      <Plus size={16} />
      {children}
    </button>
  );
}
export function EntityButton({
  entity,
  onClick,
  children,
}: {
  entity: Entity;
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <button className="entity-row" onClick={onClick}>
      <span>{children || entity.title || entity.name}</span>
      {entity.status ? <Badge status={entity.status} /> : <ArrowUpRight size={15} />}
    </button>
  );
}
export function EventRow({
  event,
  onSelect,
  compact = false,
}: {
  event: EngineeringEvent;
  onSelect: (s: Selection) => void;
  compact?: boolean;
}) {
  const snap = event.payload.after || event.payload.before;
  const title = snap?.title || snap?.name || (event.payload.revision ? '方案版本记录' : '工程关联');
  return (
    <button
      className={`event-row ${compact ? 'compact' : ''}`}
      onClick={() => onSelect({ kind: event.entity_type, id: event.entity_id, event })}
    >
      <div className={`event-marker kind-${event.entity_type}`}>
        <span>{kindLabels[event.entity_type]?.slice(0, 1) || '·'}</span>
      </div>
      <div className="event-content">
        <div>
          <strong>{eventLabels[event.event_type] || event.event_type}</strong>
          <span className="event-time">{formatDate(event.occurred_at)}</span>
        </div>
        <p>
          {String(title)}
          {event.actor_type === 'seed' && <span className="demo-label">Demo</span>}
        </p>
        {!compact && (
          <span className="event-code">
            {event.event_type} · {event.actor_type}
          </span>
        )}
      </div>
      <ArrowUpRight size={15} />
    </button>
  );
}
