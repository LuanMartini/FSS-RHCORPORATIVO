import { useRef, type FormEvent, type ReactNode } from 'react';
import Icon, { type IconName } from './Icon';

export function Brand() {
  return <span className="brand"><span className="brand-mark"><Icon name="brand" size={23} /></span><span>FSS <strong>RH</strong><small>Recursos Humanos</small></span></span>;
}

export function PageHeading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <header className="page-heading"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</header>;
}

export function Feedback({ children, kind = 'error', retry }: { children: ReactNode; kind?: 'error' | 'success' | 'warning'; retry?: () => void }) {
  return <div className={`feedback feedback--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
    <Icon name={kind === 'success' ? 'check' : 'alert'} />
    <div>{children}{retry && <button type="button" className="ui-button ui-button--secondary" onClick={retry}>Tentar novamente</button>}</div>
  </div>;
}

export function EmptyState({ title, description, icon = 'inbox', action }: { title: string; description?: string; icon?: IconName; action?: ReactNode }) {
  return <div className="empty-state"><span className="icon-tile"><Icon name={icon} /></span><p><strong>{title}</strong></p>{description && <p>{description}</p>}{action}</div>;
}

export function Loading({ label = 'Carregando dados' }: { label?: string }) {
  return <div className="loading-state" role="status"><span className="sr-only">{label}</span><div aria-hidden="true" /><div aria-hidden="true" /><div aria-hidden="true" /></div>;
}

export function AuthLayout({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <main className="auth-layout">
    <div className="auth-content"><Brand /><div className="auth-card"><PageHeading title={title} description={description} />{children}</div></div>
    <div className="auth-illustration" aria-hidden="true"><div className="auth-rings"><Icon name="people" size={70} /></div></div>
  </main>;
}

export function TableRegion({ label, children }: { label: string; children: ReactNode }) {
  // The scroll region needs keyboard focus to expose off-screen columns.
  // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
  return <div className="table-region" role="region" aria-label={label} tabIndex={0}>{children}</div>;
}

export function StatusBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'success' | 'warning' | 'danger' }) {
  return <span className={`status-badge status-badge--${tone}`}><span aria-hidden="true" />{children}</span>;
}

export function SubmitForm({ submit, children, ...props }: {
  submit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  children: ReactNode;
} & Omit<React.ComponentPropsWithoutRef<'form'>, 'onSubmit' | 'children'>) {
  const pending = useRef(false);
  return <form {...props} onSubmit={async (event) => {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    try { await submit(event); } finally { pending.current = false; }
  }}>{children}</form>;
}
