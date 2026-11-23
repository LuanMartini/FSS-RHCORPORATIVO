import { useRef } from 'react';
import type { Page } from '../types/page';
import { canOpenPage, navigation } from '../navigation';
import Icon from './Icon';
import { Brand } from './ui';

interface Props {
  page: Page | undefined;
  setPage: (page: Page) => void;
  permissions: string[];
  onLogout: () => void;
}

export default function Sidebar({ page, setPage, permissions, onLogout }: Props) {
  const drawer = useRef<HTMLDialogElement>(null);

  function renderNavigation() {
    return <nav aria-label="Módulos do FSS RH" className="sidebar-navigation">
      {navigation.map((group) => {
        const items = group.items.filter((item) => canOpenPage(item.key, permissions));
        return items.length > 0 && <div className="nav-group" key={group.label}>
          <p>{group.label}</p>
          {items.map((item) => <button key={item.key} type="button"
            aria-current={page === item.key ? 'page' : undefined}
            onClick={() => { if (drawer.current?.open) drawer.current.close(); setPage(item.key); }}>
            <Icon name={item.icon} size={18} /><span>{item.label}</span>
          </button>)}
        </div>;
      })}
    </nav>;
  }

  const exit = <button type="button" className="sidebar-exit" onClick={onLogout}><Icon name="logout" size={18} /> Sair da conta</button>;

  return <>
    <aside className="sidebar"><div className="sidebar-brand"><Brand /></div>{renderNavigation()}{exit}</aside>
    <button type="button" className="mobile-menu ui-button ui-button--secondary" onClick={() => drawer.current?.showModal()} aria-haspopup="dialog">
      <Icon name="menu" /><span className="sr-only">Abrir navegação</span>
    </button>
    <dialog ref={drawer} className="sidebar-drawer" aria-label="Navegação">
      <div className="sidebar-brand"><Brand /><button type="button" className="drawer-close" onClick={() => drawer.current?.close()} aria-label="Fechar navegação"><Icon name="close" /></button></div>
      {renderNavigation()}{exit}
    </dialog>
  </>;
}
