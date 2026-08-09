import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../context/useAuth', () => ({ useAuth: () => ({ login: vi.fn() }) }));
vi.mock('../services/api', () => ({
  apiFetch: vi.fn(async (path?: string) => {
    const route = String(path ?? '');
    if (route === '/login') {
      return { token: 'token-de-teste', usuario: { nome: 'Ana', email: 'ana@example.test', perfil: 'ADMINISTRADOR', permissoes: [] } };
    }
    if (route === '/rh/ponto') return { tipo: 'ENTRADA', hora: '08:00' };
    if (route.startsWith('/rh/ponto/')) return [];
    if (route.startsWith('/rh/folha/')) {
      return {
        funcionario: { id: 1, nome: 'Ana Silva', cpf: '000.000.000-00', cargo: 1 }, mesReferencia: 1, anoReferencia: 2026,
        vencimentos: { salarioBase: '5.000,00' }, descontos: { inss: '500,00', irrf: '300,00' }, provisoes: { fgts: '400,00' },
        totalBruto: '5.000,00', totalDescontos: '800,00', totalLiquido: '4.200,00',
      };
    }
    return [];
  }),
  apiFormData: vi.fn(),
}));

import { useFocusTrap } from '../components/a11y/useFocusTrap';
import Ferias from '../pages/Ferias';
import Holerite from '../pages/Holerite';
import Login from '../pages/Login';
import RegistrarPonto from '../pages/RegistrarPonto';
import { apiFetch } from '../services/api';

const funcionarios = [{ id: 1, nome: 'Ana Silva', ativo: true }] as never[];
const apiFetchMock = vi.mocked(apiFetch);

beforeEach(() => apiFetchMock.mockClear());

describe('fluxos prioritários da interface', () => {
  it('envia o login com as credenciais preenchidas', async () => {
    const view = render(<Login canRegister onSwitch={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'ana@example.test' } });
    fireEvent.change(screen.getByLabelText(/senha/i), { target: { value: 'senha-de-teste' } });
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }));
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/login', expect.objectContaining({ method: 'POST' })));
    view.unmount();
  });

  it('registra ponto, gera holerite e envia solicitação de férias', async () => {
    const onSuccess = vi.fn();
    const pointView = render(<RegistrarPonto funcionarios={funcionarios} onSuccess={onSuccess} />);
    fireEvent.change(screen.getByLabelText(/funcionário/i), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /registrar/i }));
    expect((await screen.findByRole('status')).textContent).toMatch(/registro entrada/i);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    pointView.unmount();

    const payslipView = render(<Holerite funcionarios={funcionarios} />);
    fireEvent.change(screen.getByLabelText(/funcionário/i), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /gerar/i }));
    expect(await screen.findByRole('heading', { name: /holerite gerado/i })).toBeTruthy();
    expect(apiFetchMock).toHaveBeenCalledWith('/rh/folha/1');
    payslipView.unmount();

    const vacationView = render(<Ferias funcionarios={funcionarios} onRefresh={vi.fn()} />);
    await screen.findByRole('heading', { name: /férias/i });
    fireEvent.change(screen.getByLabelText(/funcionário/i), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/início/i), { target: { value: '2026-02-01' } });
    fireEvent.change(screen.getByLabelText(/fim/i), { target: { value: '2026-02-10' } });
    fireEvent.click(screen.getByRole('button', { name: /enviar solicitação/i }));
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/rh/ferias', expect.objectContaining({ method: 'POST' })));
    vacationView.unmount();
  });
});

function FocusTrapExample({ onClose }: { onClose: () => void }) {
  const dialogRef = useFocusTrap<HTMLDivElement>(true, onClose);
  return <div ref={dialogRef} tabIndex={-1}><button type="button">Primeiro</button><button type="button">Último</button></div>;
}

it('mantém o foco no diálogo e o devolve ao fechar', async () => {
  const trigger = document.createElement('button');
  document.body.append(trigger);
  trigger.focus();
  const onClose = vi.fn();
  const view = render(<FocusTrapExample onClose={onClose} />);
  const first = screen.getByRole('button', { name: 'Primeiro' });
  const last = screen.getByRole('button', { name: 'Último' });

  await waitFor(() => expect(document.activeElement).toBe(first));
  last.focus();
  fireEvent.keyDown(document, { key: 'Tab' });
  expect(document.activeElement).toBe(first);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(document.activeElement).toBe(trigger);
  trigger.remove();
});
