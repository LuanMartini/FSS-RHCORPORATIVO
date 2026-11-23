import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import App from '../App';

const metrics = {
  colaboradores: { total: 0, ativos: 0, desligados: 0, emFerias: 0 },
  estrutura: { totalDepartamentos: 0, totalCargos: 0, distribuicaoPorDepto: [] },
  pontoDoDia: { registrosHoje: 0 },
};

function login() {
  render(<App />);
  fireEvent.change(screen.getByLabelText(/e-mail/i, { selector: 'input' }), { target: { value: 'usuario@example.test' } });
  fireEvent.change(screen.getByLabelText(/senha/i, { selector: 'input' }), { target: { value: 'senha-de-teste' } });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
}

function respondToApi(dashboard: () => Response | Promise<Response>, permissions: string[]) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    switch (new URL(url).pathname) {
      case '/login': return Response.json({ token: 'sessao-teste', usuario: { nome: 'Ana', email: 'usuario@example.test', perfil: 'RH', permissoes: permissions } });
      case '/rh/funcionarios': return Response.json([]);
      case '/rh/dashboard': return dashboard();
      default: throw new Error(`Rota inesperada: ${url}`);
    }
  }));
}

afterEach(() => vi.unstubAllGlobals());

it('exibe os módulos permitidos e abre o estado vazio da lista de funcionários', async () => {
  respondToApi(() => Response.json(metrics), ['rh.dashboard.read', 'employee.read.basic']);
  login();
  expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeTruthy();
  const nav = screen.getByRole('navigation', { name: 'Módulos do FSS RH' });
  expect(within(nav).queryByRole('button', { name: 'Folha de pagamento' })).toBeNull();
  fireEvent.click(within(nav).getByRole('button', { name: 'Funcionários' }));
  expect(await screen.findByText('Nenhum funcionário disponível')).toBeTruthy();
  expect(within(nav).getByRole('button', { name: 'Funcionários' }).getAttribute('aria-current')).toBe('page');
});

it('oferece nova tentativa e omite indicadores financeiros quando a resposta não inclui folha', async () => {
  const dashboard = vi.fn<() => Response | Promise<Response>>()
    .mockRejectedValueOnce(new TypeError('Network unavailable'))
    .mockReturnValue(Response.json(metrics));
  respondToApi(dashboard, ['rh.dashboard.read', 'payroll.read']);
  login();
  const error = await screen.findByRole('alert');
  fireEvent.click(within(error).getByRole('button', { name: 'Tentar novamente' }));
  expect(await screen.findByRole('heading', { name: 'Dashboard', level: 1 })).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Custo bruto da folha' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Abrir folha' })).toBeNull();
});

it('redireciona ao login e informa quando a API invalida a sessão', async () => {
  respondToApi(() => Response.json({}, { status: 401 }), ['rh.dashboard.read']);
  login();
  await waitFor(() => expect(screen.getByText(/sessão expirou/i)).toBeTruthy());
  expect(screen.getByRole('heading', { name: 'Acesse sua conta' })).toBeTruthy();
});
