import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../context/useAuth', () => ({ useAuth: () => ({ login: vi.fn() }) }));
vi.mock('../services/api', () => ({
  apiFetch: vi.fn(async (path: string) => {
    if (path === '/rh/ferias') return [];
    if (path === '/jornada/colaboradores') return [];
    return [];
  }),
  apiFormData: vi.fn(),
}));

import Ferias from '../pages/Ferias';
import Holerite from '../pages/Holerite';
import Login from '../pages/Login';
import RegistrarPonto from '../pages/RegistrarPonto';
import EspelhoPontoAvancado from '../pages/EspelhoPontoAvancado';

const funcionarios = [{ id: 1, nome: 'Ana Silva', ativo: true }] as never[];

async function expectAccessible(view: ReturnType<typeof render>) {
  const results = await axe(view.container);
  expect(results.violations).toEqual([]);
}

describe('telas prioritárias', () => {
  it('mantém login acessível e com campos nomeados', async () => {
    const view = render(<Login canRegister onSwitch={vi.fn()} />);
    expect(screen.getByLabelText(/e-mail/i)).toBeTruthy();
    expect(screen.getByLabelText(/senha/i)).toBeTruthy();
    await expectAccessible(view);
  });

  it('mantém registro de ponto acessível', async () => {
    const view = render(<RegistrarPonto funcionarios={funcionarios} onSuccess={vi.fn()} />);
    expect(screen.getByLabelText(/funcionário/i)).toBeTruthy();
    await expectAccessible(view);
  });

  it('mantém férias acessível', async () => {
    const view = render(<Ferias funcionarios={funcionarios} onRefresh={vi.fn()} />);
    expect(await screen.findByRole('heading', { name: /férias/i })).toBeTruthy();
    await expectAccessible(view);
  });

  it('mantém holerite acessível', async () => {
    const view = render(<Holerite funcionarios={funcionarios} />);
    expect(screen.getByLabelText(/funcionário/i)).toBeTruthy();
    await expectAccessible(view);
  });

  it('mantém espelho de ponto acessível', async () => {
    const view = render(<EspelhoPontoAvancado />);
    expect(await screen.findByRole('heading', { name: /espelho de ponto/i })).toBeTruthy();
    await expectAccessible(view);
  });
});
